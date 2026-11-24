package local.tmall.usbspeaker;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.graphics.Typeface;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import android.view.MotionEvent;
import android.view.View;
import android.os.SystemClock;

/** Transparent glass controls above the full-screen ink surface. */
public final class SpeakerView extends View {
    public interface Listener {
        void onModePressed();
        void onHomePressed();
        void onVolumePressed(boolean raise);
        void onScenePressed();
        void onSceneTouch(float x, float y);
    }
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rect = new RectF();
    private final Typeface light = Typeface.create("sans-serif-light", Typeface.NORMAL);
    private final Typeface normal = Typeface.create("sans-serif", Typeface.NORMAL);
    private Listener listener;
    private FluidView fluid;
    private String state = "stopped", message = "";
    private int volume, maxVolume = 15;
    private float downX, downY, previousX, previousY;
    private boolean inkGesture;
    private boolean miniatureScene, wakeTouch;
    private long controlsUntil;
    private String sceneMessage = "";
    private final SimpleDateFormat timeFormat = new SimpleDateFormat("HH:mm:ss", Locale.SIMPLIFIED_CHINESE);
    private final SimpleDateFormat dateFormat = new SimpleDateFormat("yyyy年M月d日 EEEE", Locale.SIMPLIFIED_CHINESE);
    private final Runnable clockTick = new Runnable() {
        @Override public void run() {
            invalidate();
            postDelayed(this, 1000-System.currentTimeMillis()%1000);
        }
    };

    public SpeakerView(Context context) {
        super(context);
        setFocusable(true);
        setBackgroundColor(Color.TRANSPARENT);
    }
    public void setListener(Listener value) { listener = value; }
    public void setFluidView(FluidView value) { fluid = value; }
    public void setMiniatureScene(boolean value) {
        miniatureScene = value;
        controlsUntil = SystemClock.uptimeMillis() + 7000;
        invalidate();
    }
    public void setSceneMessage(String message) {
        sceneMessage = message == null ? "" : message;
        invalidate();
    }

    public void update(String newState, String newMessage, float amplitude,
                       float[] wave, float[] spectrum, int newVolume, int newMax) {
        String next = newState == null ? "error" : newState;
        String nextMessage = newMessage == null ? "" : newMessage;
        boolean changed = !next.equals(state) || !nextMessage.equals(message)
                || volume != newVolume || maxVolume != Math.max(1, newMax);
        state = next;
        message = newMessage == null ? "" : newMessage;
        volume = newVolume;
        maxVolume = Math.max(1, newMax);
        if (changed) invalidate();
    }

    @Override protected void onAttachedToWindow() {
        super.onAttachedToWindow();
        post(clockTick);
    }

    @Override protected void onDetachedFromWindow() {
        removeCallbacks(clockTick);
        super.onDetachedFromWindow();
    }

    private void text(Canvas c, String s, float x, float y, float size, int alpha, Typeface face) {
        paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setTypeface(face);
        paint.setTextSize(size); paint.setColor(Color.argb(alpha, 245, 247, 250));
        paint.setShadowLayer(2,0,1,Color.argb(165,0,0,0));
        c.drawText(s, x, y, paint);
        paint.clearShadowLayer();
    }
    private void centered(Canvas c,String s,float x,float y,float size,int alpha,Typeface face) {
        paint.setTypeface(face);paint.setTextSize(size);
        text(c,s,x-paint.measureText(s)*.5f,y,size,alpha,face);
    }
    private void glass(Canvas c,float left,float top,float right,float bottom,float radius,int alpha) {
        rect.set(left,top,right,bottom);
        // Real translucency: the moving fluid remains visible through every control.
        paint.setStyle(Paint.Style.FILL);
        paint.setShader(null);
        paint.setColor(Color.argb((int)(alpha*.40f),10,15,23));
        c.drawRoundRect(rect,radius,radius,paint);
        paint.setShader(new LinearGradient(left,top,right,bottom,
                new int[]{Color.argb((int)(alpha*.10f),240,245,255),Color.argb((int)(alpha*.025f),210,230,250)},
                null,Shader.TileMode.CLAMP));
        c.drawRoundRect(rect,radius,radius,paint);
        paint.setShader(null);paint.setStyle(Paint.Style.STROKE);paint.setStrokeWidth(1);
        paint.setShader(new LinearGradient(left,top,left,bottom,
                new int[]{Color.argb((int)(alpha*.37f),255,255,255),Color.argb((int)(alpha*.08f),255,255,255)},
                null,Shader.TileMode.CLAMP));
        c.drawRoundRect(rect,radius,radius,paint);
        paint.setShader(null);paint.setStyle(Paint.Style.FILL);
    }
    @Override protected void onDraw(Canvas c) {
        super.onDraw(c);
        if (miniatureScene && SystemClock.uptimeMillis() > controlsUntil && sceneMessage.length() == 0) return;
        boolean playing="streaming".equals(state), inMode=playing||"waiting".equals(state);
        c.save();c.scale(getWidth()/1024f,getHeight()/600f);
        int alpha=255;
        Date now = new Date();
        if (miniatureScene) {
            glass(c,20,18,196,65,20,alpha);
            centered(c,timeFormat.format(now),108,50,26,alpha,light);
        } else {
            glass(c,322,20,702,154,32,alpha);
            centered(c,timeFormat.format(now),512,86,52,alpha,light);
            centered(c,dateFormat.format(now),512,126,20,240,normal);
        }
        glass(c,858,18,1004,65,20,alpha);
        centered(c,miniatureScene?"切换流体":"切换小店",931,48,16,alpha,normal);
        if (miniatureScene && sceneMessage.length() > 0) {
            glass(c,260,262,764,316,24,alpha);
            centered(c,sceneMessage,512,294,15,alpha,normal);
        }
            if(!playing){
                String hint="error".equals(state)?message:inMode?
                        "在电脑的声音输出中选择 Tmall USB Speaker":"连接电脑后，点击进入音箱模式";
                // Long driver errors stay readable without extending outside the glass panel.
                paint.setTypeface(normal);paint.setTextSize(14);
                while(paint.measureText(hint)>850&&hint.length()>2)hint=hint.substring(0,hint.length()-2)+"…";
                float hintWidth=paint.measureText(hint);
                glass(c,512-hintWidth*.5f-24,435,512+hintWidth*.5f+24,477,21,alpha);
                centered(c,hint,512,461,14,(int)(alpha*.90f),normal);
            }
            glass(c,32,516,216,572,28,alpha);
            centered(c,inMode?"退出音箱模式":"进入音箱模式",124,551,15,alpha,normal);
            glass(c,350,516,674,572,28,alpha);
            centered(c,"−",380,552,25,alpha,light);centered(c,"+",644,552,24,alpha,light);
            paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeWidth(2);
            paint.setColor(Color.argb((int)(alpha*.26f),255,255,255));c.drawLine(422,544,602,544,paint);
            float thumb=422+180f*volume/maxVolume;
            paint.setColor(Color.argb(alpha,244,248,255));c.drawLine(422,544,thumb,544,paint);
            c.drawCircle(thumb,544,4,paint);paint.setStrokeCap(Paint.Cap.BUTT);
            glass(c,836,516,992,572,28,alpha);
            centered(c,"返回桌面",914,551,15,alpha,normal);
        c.restore();
        // Static glass controls are cached by Android; only clock/state changes redraw them.
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        float x=e.getX()*1024/getWidth(),y=e.getY()*600/getHeight();
        if(e.getAction()==MotionEvent.ACTION_DOWN){
            wakeTouch=miniatureScene && SystemClock.uptimeMillis()>controlsUntil;
            controlsUntil=SystemClock.uptimeMillis()+6000;
            if(miniatureScene)invalidate();
            downX=previousX=x;downY=previousY=y;
            inkGesture=!miniatureScene&&y>166&&y<420;
            if(miniatureScene&&listener!=null&&y>80&&y<500)listener.onSceneTouch(x/1024,y/600);
            if(inkGesture&&fluid!=null)fluid.touch(x/1024, y/600, .008f, .008f);
            return true;
        }
        if(e.getAction()==MotionEvent.ACTION_MOVE){
            if(miniatureScene&&listener!=null&&y>80&&y<500)listener.onSceneTouch(x/1024,y/600);
            if(inkGesture&&fluid!=null)fluid.touch(x/1024,y/600,(x-previousX)/1024,(y-previousY)/600);
            previousX=x;previousY=y;return true;
        }
        if(e.getAction()!=MotionEvent.ACTION_UP||listener==null)return true;
        if(miniatureScene)listener.onSceneTouch(.5f,.5f);
        performClick();
        if(wakeTouch)return true;
        if(Math.abs(x-downX)>30||Math.abs(y-downY)>30)return true;
        if(y>=12&&y<=75&&x>=850){listener.onScenePressed();return true;}
        if(y<508||y>582)return true;
        if(x>=24&&x<=224)listener.onModePressed();
        else if(x>=828)listener.onHomePressed();
        else if(x>=342&&x<422)listener.onVolumePressed(false);
        else if(x>602&&x<=682)listener.onVolumePressed(true);
        return true;
    }
    @Override public boolean performClick(){super.performClick();return true;}
}
