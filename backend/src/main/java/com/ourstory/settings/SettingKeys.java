package com.ourstory.settings;

import java.util.Map;
import java.util.Set;

/** Storage keys of the settings table and the public (camelCase) names the admin API uses for them. */
public final class SettingKeys {

    public static final String APP_TITLE = "app_title";
    public static final String TAGLINE = "tagline";
    public static final String DEFAULT_THEME = "default_theme";
    public static final String SPECIAL_DATE = "special_date";
    public static final String HER_NAME = "her_name";
    public static final String MY_NAME = "my_name";
    public static final String EASTER_EGG_NICKNAMES = "easter_egg_nicknames";
    public static final String HERO_MEDIA_IDS = "hero_media_ids";
    public static final String VIEWER_EPOCH = "viewer_epoch";

    /** SECRET-ish: never returned by any API. */
    public static final String UNLOCK_QUESTION = "unlock_question";
    /** SECRET: JSON array of PBKDF2 hash strings. Never returned by any API. */
    public static final String UNLOCK_ANSWER_HASHES = "unlock_answer_hashes";

    /** Admin API name to storage key, for the non-secret settings an admin may edit directly. */
    static final Map<String, String> EDITABLE = Map.of(
            "appTitle", APP_TITLE,
            "tagline", TAGLINE,
            "defaultTheme", DEFAULT_THEME,
            "specialDate", SPECIAL_DATE,
            "herName", HER_NAME,
            "myName", MY_NAME,
            "easterEggNicknames", EASTER_EGG_NICKNAMES,
            "heroMediaIds", HERO_MEDIA_IDS);

    /** Keys that must never leave the server through the generic read path. */
    static final Set<String> SECRET = Set.of(UNLOCK_QUESTION, UNLOCK_ANSWER_HASHES);

    private SettingKeys() {
    }
}
