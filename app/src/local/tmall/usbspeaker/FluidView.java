package local.tmall.usbspeaker;

import android.content.Context;
import android.opengl.GLSurfaceView;

/** Vsync-paced full-screen ink surface, independent of the audio service. */
public final class FluidView extends GLSurfaceView {
    private final FluidRenderer fluid = new FluidRenderer();

    public FluidView(Context context) {
        super(context);
        setEGLContextClientVersion(3);
        setEGLConfigChooser(8, 8, 8, 0, 0, 0);
        setPreserveEGLContextOnPause(true);
        setRenderer(fluid);
        // EGL swap follows the display's ~60 Hz vsync, without a 33 ms timer.
        setRenderMode(RENDERMODE_CONTINUOUSLY);
    }

    public void update(String state, float amplitude, float[] spectrum) {
        fluid.updateAudio("streaming".equals(state), amplitude, spectrum);
    }

    public void touch(float x, float y, float dx, float dy) {
        fluid.touch(x, 1f - y, dx, -dy);
    }
}
