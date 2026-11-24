package local.tmall.usbspeaker;

import android.graphics.Color;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.SystemClock;
import android.util.Log;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.ArrayDeque;
import java.util.Random;
import java.util.HashMap;
import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * GLES 3 port of Pavel Dobryakov's MIT WebGL Fluid Simulation solver.
 * Semi-Lagrangian advection, vorticity confinement and pressure projection;
 * full attribution in assets/Fluid-LICENSE.txt. No WebView or microphone needed.
 */
final class FluidRenderer implements GLSurfaceView.Renderer {
    private static final String TAG = "UsbSpeakerFluid";
    private static final int HALF_FLOAT = 0x140B;
    private static final int RGBA16F = 0x881A;
    private static final String VERTEX =
        "attribute vec2 position; varying vec2 uv; void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}";
    private static final String HEADER =
        "precision highp float; varying vec2 uv; uniform vec2 texel;";
    private static final String SPLAT = HEADER +
        "uniform sampler2D source;uniform vec2 point;uniform vec3 color;uniform float radius,aspect;" +
        "void main(){vec2 p=uv-point;p.x*=aspect;float s=exp(-dot(p,p)/radius);" +
        "gl_FragColor=vec4(texture2D(source,uv).rgb+s*color,1.);}";
    private static final String ADVECT = HEADER +
        "uniform sampler2D velocity,source;uniform float dt,decay;" +
        "void main(){vec2 p=uv-dt*texture2D(velocity,uv).xy*texel;" +
        "gl_FragColor=texture2D(source,p)/(1.+decay*dt);}";
    private static final String CURL = HEADER + "uniform sampler2D velocity;void main(){" +
        "float L=texture2D(velocity,uv-vec2(texel.x,0.)).y;float R=texture2D(velocity,uv+vec2(texel.x,0.)).y;" +
        "float T=texture2D(velocity,uv+vec2(0.,texel.y)).x;float B=texture2D(velocity,uv-vec2(0.,texel.y)).x;" +
        "gl_FragColor=vec4(.5*(R-L-T+B),0.,0.,1.);}";
    private static final String VORTICITY = HEADER +
        "uniform sampler2D velocity,curlField;uniform float dt,strength;void main(){" +
        "float L=texture2D(curlField,uv-vec2(texel.x,0.)).x;float R=texture2D(curlField,uv+vec2(texel.x,0.)).x;" +
        "float T=texture2D(curlField,uv+vec2(0.,texel.y)).x;float B=texture2D(curlField,uv-vec2(0.,texel.y)).x;" +
        "float C=texture2D(curlField,uv).x;vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));" +
        "f/=length(f)+.0001;f*=strength*C;f.y*=-1.;vec2 v=texture2D(velocity,uv).xy;" +
        "gl_FragColor=vec4(clamp(v+f*dt,vec2(-300.),vec2(300.)),0.,1.);}";
    private static final String DIVERGENCE = HEADER + "uniform sampler2D velocity;void main(){" +
        "vec2 c=texture2D(velocity,uv).xy;" +
        "float L=texture2D(velocity,uv-vec2(texel.x,0.)).x;float R=texture2D(velocity,uv+vec2(texel.x,0.)).x;" +
        "float T=texture2D(velocity,uv+vec2(0.,texel.y)).y;float B=texture2D(velocity,uv-vec2(0.,texel.y)).y;" +
        "if(uv.x<texel.x)L=-c.x;if(uv.x>1.-texel.x)R=-c.x;" +
        "if(uv.y<texel.y)B=-c.y;if(uv.y>1.-texel.y)T=-c.y;" +
        "gl_FragColor=vec4(.5*(R-L+T-B),0.,0.,1.);}";
    private static final String PRESSURE = HEADER + "uniform sampler2D pressure,divergence;void main(){" +
        "float L=texture2D(pressure,uv-vec2(texel.x,0.)).x;float R=texture2D(pressure,uv+vec2(texel.x,0.)).x;" +
        "float T=texture2D(pressure,uv+vec2(0.,texel.y)).x;float B=texture2D(pressure,uv-vec2(0.,texel.y)).x;" +
        "float d=texture2D(divergence,uv).x;gl_FragColor=vec4((L+R+T+B-d)*.25,0.,0.,1.);}";
    private static final String PROJECT = HEADER + "uniform sampler2D pressure,velocity;void main(){" +
        "float L=texture2D(pressure,uv-vec2(texel.x,0.)).x;float R=texture2D(pressure,uv+vec2(texel.x,0.)).x;" +
        "float T=texture2D(pressure,uv+vec2(0.,texel.y)).x;float B=texture2D(pressure,uv-vec2(0.,texel.y)).x;" +
        "gl_FragColor=vec4(texture2D(velocity,uv).xy-vec2(R-L,T-B),0.,1.);}";
    private static final String DISPLAY = HEADER +
        "uniform sampler2D dye;" +
        "vec3 ink(vec2 p){return texture2D(dye,p).rgb;}" +
        "void main(){vec3 c=ink(uv);vec3 L=ink(uv-vec2(texel.x,0.));vec3 R=ink(uv+vec2(texel.x,0.));" +
        "vec3 T=ink(uv+vec2(0.,texel.y));vec3 B=ink(uv-vec2(0.,texel.y));" +
        "vec3 n=normalize(vec3(length(R)-length(L),length(T)-length(B),.18));" +
        "float light=clamp(dot(n,normalize(vec3(-.35,.55,1.)))+.45,.55,1.4);" +
        "vec3 halo=(ink(uv+vec2(.014,0.))+ink(uv-vec2(.014,0.))+ink(uv+vec2(0.,.024))+ink(uv-vec2(0.,.024)))*.25;" +
        "c=(c*light+halo*.18)*1.85; c=max(c,vec3(0.));c=(c*(2.51*c+.03))/(c*(2.43*c+.59)+.14);" +
        "vec2 p=uv-.5;float vignette=1.-.22*dot(p,p);" +
        "gl_FragColor=vec4(pow(clamp(c,0.,1.),vec3(.92))*vignette+vec3(.003,.005,.009),1.);}";

    private static final String COPY = HEADER +
        "uniform sampler2D source;void main(){gl_FragColor=texture2D(source,uv);}";
    private static final String MUSIC = HEADER +
        "uniform sampler2D source;uniform vec4 centers[4],tints[4],shapes[4];" +
        "uniform vec3 audio;uniform float dt,time,energy,aspect,dyePass;" +
        "void main(){vec3 base=texture2D(source,uv).rgb;" +
        "if(dyePass>.5){vec3 ink=vec3(0.);" +
        "for(int i=0;i<4;i++){vec4 e=centers[i];vec4 sh=shapes[i];vec2 p=uv-e.xy;p.x*=aspect;" +
        "vec2 q=vec2(sh.x*p.x-sh.y*p.y,sh.y*p.x+sh.x*p.y)*vec2(.66,1.45);" +
        "float g=exp(-dot(q,q)/e.z)*e.w;ink+=tints[i].rgb*g;}" +
        "gl_FragColor=vec4(base+ink*dt*2.*(.10+energy*.40),1.);" +
        "}else{vec2 z=uv*vec2(aspect,1.);" +
        "vec2 force=vec2(-sin(z.y*6.3+sin(z.x*3.2+time*.19)+time*.23)," +
        "cos(z.x*5.7+sin(z.y*3.4-time*.17)-time*.21))*(7.+audio.x*26.);" +
        "force+=vec2(cos(z.y*11.2-time*.37),sin(z.x*9.1+time*.31))*(2.+audio.z*9.);" +
        "for(int i=0;i<4;i++){vec4 e=centers[i];vec2 p=uv-e.xy;p.x*=aspect;" +
        "float g=exp(-dot(p,p)/e.z)*e.w;" +
        "force+=vec2(-p.y,p.x)*inversesqrt(dot(p,p)+.006)*g*shapes[i].z*(24.+energy*84.);}" +
        "gl_FragColor=vec4(clamp(base.xy+force*dt,vec2(-250.),vec2(250.)),0.,1.);}}";

    private final FloatBuffer quad = ByteBuffer.allocateDirect(8 * 4).order(ByteOrder.nativeOrder())
        .asFloatBuffer();
    private final Random random = new Random();
    private final ArrayDeque<float[]> touches = new ArrayDeque<float[]>();
    private final float[] bands = new float[3];
    private float targetEnergy, energy, low, mid, high;
    private long lastAudio, lastFrame, started, measuredAt;
    private int measuredFrames;
    private float time;
    private int width, height, simW, simH, dyeW, dyeH, frameCount;
    private boolean ready;
    private Pair velocity, dye, pressure;
    private Target curl, divergence, shaded;
    private final Emitter[] emitters = new Emitter[8];
    private final float[] centers = new float[16], tints = new float[16], shapes = new float[16];
    private Program splat, advect, curlProgram, vorticity, divergenceProgram, pressureProgram, project, display, copy, music;

    FluidRenderer() { quad.put(new float[] {-1,-1,1,-1,-1,1,1,1}).position(0); }

    synchronized void updateAudio(boolean streaming, float amplitude, float[] spectrum) {
        targetEnergy = streaming ? clamp(amplitude * 1.25f, 0, 1) : 0;
        for (int b = 0; b < 3; b++) {
            float total = 0;
            if (streaming && spectrum != null && spectrum.length > 0) {
                int from = b * spectrum.length / 3, to = (b + 1) * spectrum.length / 3;
                for (int j = from; j < to; j++) total += spectrum[j];
                total /= Math.max(1, to - from);
            }
            bands[b] = total;
        }
        lastAudio = SystemClock.uptimeMillis();
    }

    synchronized void touch(float x, float y, float dx, float dy) {
        if (touches.size() < 12) touches.add(new float[] {x,y,dx,dy});
    }

    @Override public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        ready = false;
        display = null;
        // A new EGL context invalidates every old program/texture ID.
        velocity = dye = pressure = null;
        curl = divergence = shaded = null;
        try {
            splat = new Program(SPLAT); advect = new Program(ADVECT);
            curlProgram = new Program(CURL); vorticity = new Program(VORTICITY);
            divergenceProgram = new Program(DIVERGENCE); pressureProgram = new Program(PRESSURE);
            project = new Program(PROJECT); display = new Program(DISPLAY);
            copy = new Program(COPY); music = new Program(MUSIC);
            Log.i(TAG, "GPU " + GLES20.glGetString(GLES20.GL_RENDERER));
        } catch (RuntimeException e) { Log.e(TAG, "Fluid shader setup failed", e); }
    }

    @Override public void onSurfaceChanged(GL10 gl, int w, int h) {
        width = w; height = h;
        if (display == null) return;
        try {
            releaseTargets();
            float aspect = (float) w / Math.max(1, h);
            simH = 128; simW = Math.round(simH * aspect);
            dyeH = 300; dyeW = Math.round(dyeH * aspect);
            velocity = new Pair(simW, simH); pressure = new Pair(simW, simH);
            dye = new Pair(dyeW, dyeH); curl = new Target(simW, simH); divergence = new Target(simW, simH);
            // Shade at a slightly smaller size, then linearly upscale. Fluid solver resolution stays intact.
            shaded = new Target(Math.round(384 * aspect), 384, false);
            started = SystemClock.uptimeMillis(); lastFrame = 0; time = 0; frameCount = 0;
            measuredAt = started; measuredFrames = 0;
            for (int i = 0; i < emitters.length; i++) {
                emitters[i] = new Emitter(i);
            }
            // Fill the entire landscape with separate warm/cool ink plumes, not one central blob.
            for (int i = 0; i < 9; i++) {
                float x = .08f + random.nextFloat() * .84f, y = .12f + random.nextFloat() * .76f;
                inject(x, y, (random.nextFloat()-.5f)*110, (random.nextFloat()-.5f)*110,
                        color(i / 9f, .7f), .0028f + random.nextFloat()*.003f);
            }
            ready = true;
            Log.i(TAG, "Ready " + w + "x" + h + "; half-float solver=" + simW + "x" + simH + "; dye=" + dyeW + "x" + dyeH);
        } catch (RuntimeException e) { ready = false; Log.e(TAG, "Fluid framebuffer setup failed", e); }
    }

    @Override public void onDrawFrame(GL10 gl) {
        long now = SystemClock.uptimeMillis();
        float dt = lastFrame == 0 ? .0166f : clamp((now-lastFrame)/1000f, .008f, .05f);
        lastFrame = now; time += dt;
        if (!ready) { GLES20.glClearColor(.01f,.015f,.025f,1); GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT); return; }
        float input, bass, mids, treble;
        synchronized (this) {
            boolean fresh = now-lastAudio < 600;
            input = fresh ? targetEnergy : 0;
            bass = fresh ? bands[0] : 0; mids = fresh ? bands[1] : 0; treble = fresh ? bands[2] : 0;
        }
        energy += (input-energy)*(1f-(float)Math.exp(-dt*(input>energy?12:3)));
        low += (bass-low)*(1f-(float)Math.exp(-dt*7));
        mid += (mids-mid)*(1f-(float)Math.exp(-dt*6));
        high += (treble-high)*(1f-(float)Math.exp(-dt*6));
        GLES20.glDisable(GLES20.GL_BLEND);
        simulate(dt);
        // Eight broad, independently wandering ink ribbons plus a whole-screen audio flow.
        // Both injection and smoothing use seconds, so the look is unchanged by frame rate.
        updateEmitters(dt);
        music.use(velocity.write); music.texture("source",velocity.read,0);
        music.v4array("centers",centers); music.v4array("tints",tints); music.v4array("shapes",shapes);
        music.v3("audio",low,mid,high); music.f("time",time); music.f("dt",dt);
        music.f("energy",energy); music.f("aspect",(float)width/height); music.f("dyePass",0);
        music.draw(); velocity.swap();
        music.use(dye.write); music.texture("source",dye.read,0); music.f("dyePass",1);
        music.draw(); dye.swap();
        synchronized (this) {
            while (!touches.isEmpty()) {
                float[] p = touches.remove();
                inject(p[0],p[1],clamp(p[2]*1500,-160,160),clamp(p[3]*1500,-160,160),
                        color(time*.06f, .5f), .0028f);
            }
        }
        display.use(shaded); display.texture("dye", dye.read, 0);
        display.v2("texel",1f/dyeW,1f/dyeH); display.draw();
        copy.use(null); copy.texture("source",shaded,0); copy.draw();
        frameCount++; measuredFrames++;
        if (now-measuredAt>=5000) {
            Log.i(TAG,"Fluid fps="+(measuredFrames*1000f/(now-measuredAt))+"; energy="+energy+"; GL error="+GLES20.glGetError());
            measuredFrames=0; measuredAt=now;
        }
    }

    private final class Emitter {
        float x,y,phase,hue,age,life,speed;
        Emitter(int index) {
            renew();
            x=.14f+(index%4)*.24f; y=.26f+(index/4)*.48f;
            age=life*.3f;
        }
        void renew() {
            x=.08f+random.nextFloat()*.84f; y=.12f+random.nextFloat()*.76f;
            phase=random.nextFloat()*6.283f; hue=random.nextFloat();
            age=0; life=9+random.nextFloat()*13; speed=.018f+random.nextFloat()*.025f;
        }
        void advance(float dt) {
            age+=dt;
            if(age>life)renew();
            // Slowly varying velocities, with soft edge repulsion instead of fixed orbits.
            float vx=(float)(Math.sin(time*.37+phase)+.5*Math.cos(time*.17+phase*2));
            float vy=(float)(Math.cos(time*.29+phase*1.7)+.4*Math.sin(time*.23+phase));
            x+=dt*(vx*speed+(.5f-x)*.025f); y+=dt*(vy*speed+(.5f-y)*.025f);
            x=clamp(x,.04f,.96f); y=clamp(y,.06f,.94f);
        }
    }

    private void updateEmitters(float dt) {
        for (Emitter e : emitters) e.advance(dt);
        // Alternate groups so eight sources stay alive without eight exponentials per pixel.
        for(int i=0;i<4;i++) {
            int index = (frameCount % 2) * 4 + i;
            Emitter e=emitters[index];
            float fade=clamp(e.age/2,0,1)*clamp((e.life-e.age)/2,0,1);
            fade=fade*fade*(3-2*fade);
            float band=index%3==0?low:index%3==1?mid:high;
            int k=i*4;
            centers[k]=e.x; centers[k+1]=e.y;
            centers[k+2]=.0045f+.004f*(.5f+.5f*(float)Math.sin(time*.21+e.phase))+band*.004f;
            centers[k+3]=fade*(.50f+band*.75f);
            float[] c=color(e.hue+time*.007f+mid*.025f, .85f);
            tints[k]=c[0];tints[k+1]=c[1];tints[k+2]=c[2];tints[k+3]=e.phase;
            float angle=e.phase+time*.12f;
            shapes[k]=(float)Math.cos(angle);shapes[k+1]=(float)Math.sin(angle);
            shapes[k+2]=Math.sin(e.phase*3)>0?1:-1;shapes[k+3]=0;
        }
    }

    private void simulate(float dt) {
        curlProgram.use(curl); curlProgram.texture("velocity",velocity.read,0); curlProgram.draw();
        vorticity.use(velocity.write); vorticity.texture("velocity",velocity.read,0);
        vorticity.texture("curlField",curl,1); vorticity.f("dt",dt); vorticity.f("strength",16+high*10);
        vorticity.draw(); velocity.swap();
        divergenceProgram.use(divergence); divergenceProgram.texture("velocity",velocity.read,0); divergenceProgram.draw();
        // Start each projection at zero so pressure cannot accumulate across long idle periods.
        pressure.read.clear();
        for (int i=0;i<8;i++) {
            pressureProgram.use(pressure.write); pressureProgram.texture("pressure",pressure.read,0);
            pressureProgram.texture("divergence",divergence,1); pressureProgram.draw(); pressure.swap();
        }
        project.use(velocity.write); project.texture("pressure",pressure.read,0);
        project.texture("velocity",velocity.read,1); project.draw(); velocity.swap();
        advect.use(velocity.write); advect.texture("velocity",velocity.read,0); advect.texture("source",velocity.read,1);
        advect.f("dt",dt); advect.f("decay",.22f);
        advect.draw(); velocity.swap();
        advect.use(dye.write); advect.texture("velocity",velocity.read,0); advect.texture("source",dye.read,1);
        advect.f("dt",dt); advect.f("decay",.18f+energy*.25f);
        advect.draw(); dye.swap();
    }

    private void inject(float x,float y,float dx,float dy,float[] c,float radius) {
        splat.use(velocity.write); splat.texture("source",velocity.read,0);
        splat.v2("point",x,y); splat.f("radius",radius); splat.f("aspect",(float)width/height);
        splat.v3("color",dx,dy,0); splat.draw(); velocity.swap();
        splat.use(dye.write); splat.texture("source",dye.read,0);
        splat.v2("point",x,y); splat.f("radius",radius); splat.f("aspect",(float)width/height);
        splat.v3("color",c[0],c[1],c[2]); splat.draw(); dye.swap();
    }

    private static float[] color(float hue,float gain) {
        // Jewel tones with a little white in the ink keep mixed plumes luminous.
        int c=Color.HSVToColor(new float[]{(hue%1+1)%1*360,.84f,1});
        return new float[]{Color.red(c)/255f*gain,Color.green(c)/255f*gain,Color.blue(c)/255f*gain};
    }
    private static float clamp(float x,float lo,float hi){return Math.max(lo,Math.min(hi,x));}

    private void releaseTargets() {
        if(velocity!=null)velocity.release(); if(dye!=null)dye.release(); if(pressure!=null)pressure.release();
        if(curl!=null)curl.release(); if(divergence!=null)divergence.release();
        if(shaded!=null)shaded.release();
    }
    private final class Target {
        final int texture, framebuffer, w, h;
        Target(int w,int h) { this(w,h,true); }
        Target(int w,int h,boolean floating) {
            this.w=w;this.h=h;int[] ids=new int[1];
            GLES20.glGenTextures(1,ids,0);texture=ids[0];GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,texture);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MIN_FILTER,GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_MAG_FILTER,GLES20.GL_LINEAR);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_S,GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D,GLES20.GL_TEXTURE_WRAP_T,GLES20.GL_CLAMP_TO_EDGE);
            GLES20.glTexImage2D(GLES20.GL_TEXTURE_2D,0,floating?RGBA16F:GLES20.GL_RGBA,w,h,0,GLES20.GL_RGBA,floating?HALF_FLOAT:GLES20.GL_UNSIGNED_BYTE,null);
            GLES20.glGenFramebuffers(1,ids,0);framebuffer=ids[0];GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER,framebuffer);
            GLES20.glFramebufferTexture2D(GLES20.GL_FRAMEBUFFER,GLES20.GL_COLOR_ATTACHMENT0,GLES20.GL_TEXTURE_2D,texture,0);
            int status=GLES20.glCheckFramebufferStatus(GLES20.GL_FRAMEBUFFER);
            if(status!=GLES20.GL_FRAMEBUFFER_COMPLETE)throw new IllegalStateException("Half-float framebuffer "+status);
            clear();
        }
        void clear(){GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER,framebuffer);GLES20.glViewport(0,0,w,h);
            GLES20.glClearColor(0,0,0,1);GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT);}
        void release(){GLES20.glDeleteTextures(1,new int[]{texture},0);GLES20.glDeleteFramebuffers(1,new int[]{framebuffer},0);}
    }
    private final class Pair {
        Target read,write;
        Pair(int w,int h){read=new Target(w,h);write=new Target(w,h);}
        void swap(){Target t=read;read=write;write=t;}
        void release(){read.release();write.release();}
    }
    private final class Program {
        final int id,position;
        final HashMap<String,Integer> uniforms=new HashMap<String,Integer>();
        Program(String fragment) {
            int v=shader(GLES20.GL_VERTEX_SHADER,VERTEX),f=shader(GLES20.GL_FRAGMENT_SHADER,fragment);
            id=GLES20.glCreateProgram();GLES20.glAttachShader(id,v);GLES20.glAttachShader(id,f);GLES20.glLinkProgram(id);
            int[] ok=new int[1];GLES20.glGetProgramiv(id,GLES20.GL_LINK_STATUS,ok,0);
            if(ok[0]==0)throw new IllegalStateException(GLES20.glGetProgramInfoLog(id));
            GLES20.glDeleteShader(v);GLES20.glDeleteShader(f);position=GLES20.glGetAttribLocation(id,"position");
        }
        void use(Target target){GLES20.glUseProgram(id);GLES20.glBindFramebuffer(GLES20.GL_FRAMEBUFFER,target==null?0:target.framebuffer);
            GLES20.glViewport(0,0,target==null?width:target.w,target==null?height:target.h);
            quad.position(0);GLES20.glEnableVertexAttribArray(position);GLES20.glVertexAttribPointer(position,2,GLES20.GL_FLOAT,false,0,quad);
            v2("texel",1f/simW,1f/simH);}
        int location(String name){Integer u=uniforms.get(name);if(u==null){u=GLES20.glGetUniformLocation(id,name);uniforms.put(name,u);}return u;}
        void v4array(String name,float[] values){GLES20.glUniform4fv(location(name+"[0]"),values.length/4,values,0);}
        void texture(String name,Target t,int unit){GLES20.glActiveTexture(GLES20.GL_TEXTURE0+unit);
            GLES20.glBindTexture(GLES20.GL_TEXTURE_2D,t.texture);GLES20.glUniform1i(location(name),unit);}
        void f(String name,float x){GLES20.glUniform1f(location(name),x);}
        void v2(String name,float x,float y){GLES20.glUniform2f(location(name),x,y);}
        void v3(String name,float x,float y,float z){GLES20.glUniform3f(location(name),x,y,z);}
        void draw(){GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP,0,4);}
    }
    private static int shader(int type,String source){int id=GLES20.glCreateShader(type);GLES20.glShaderSource(id,source);
        GLES20.glCompileShader(id);int[] ok=new int[1];GLES20.glGetShaderiv(id,GLES20.GL_COMPILE_STATUS,ok,0);
        if(ok[0]==0)throw new IllegalStateException(GLES20.glGetShaderInfoLog(id));return id;}
}
