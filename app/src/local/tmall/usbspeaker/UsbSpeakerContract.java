package local.tmall.usbspeaker;

/** Names shared by the screen, the playback service and the native USB bridge. */
public final class UsbSpeakerContract {
    private UsbSpeakerContract() { }

    public static final String PACKAGE = "local.tmall.usbspeaker";
    public static final String SERVICE = PACKAGE + ".UsbAudioService";
    public static final String ACTION_START = PACKAGE + ".START";
    public static final String ACTION_BOOT_START = PACKAGE + ".BOOT_START";
    public static final String ACTION_STOP = PACKAGE + ".STOP";
    public static final String ACTION_STATUS = PACKAGE + ".STATUS";
    public static final String ACTION_STATE = PACKAGE + ".STATE";
    public static final String EXTRA_STATE = "state";
    public static final String EXTRA_MESSAGE = "message";
    public static final String EXTRA_AMPLITUDE = "amplitude";
    public static final String EXTRA_WAVE = "wave";
    public static final String EXTRA_SPECTRUM = "spectrum";
    public static final String EXTRA_VOLUME = "volume";
    public static final String EXTRA_MAX_VOLUME = "max_volume";

    /** Linux abstract namespace sockets created by the USB audio bridge. */
    public static final String CONTROL_SOCKET = "tmall.usbspeaker.control";
    public static final String PCM_SOCKET = "tmall.usbspeaker.pcm";
    public static final int CONTROL_PORT = 18767;
    public static final int PCM_PORT = 18768;
    public static final String PREFS_NAME = "usb_speaker_preferences";
    public static final String PREF_ENABLED = "enabled";
    public static final String EXTRA_BOOT_START = "boot_start";
}
