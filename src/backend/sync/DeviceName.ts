/**
 *  What this installation is called, wherever something needs to say where it happened.
 *
 *  Its own module because three unrelated places need the same answer and must not disagree
 *  about it: the header that names this device in the user's device list, the closed tab the
 *  service worker records, and the panel that decides whether a row was closed somewhere else.
 *  The third only works if the first two produce the same string - a row stamped with one
 *  label and compared against another is a row that claims to have happened elsewhere.
 *
 *  It takes the chosen name rather than reading it, so that the service worker - which holds
 *  no singletons between events - can use it with a name read straight out of storage.
 */

/**
 *  Names this installation.
 *
 *  The name the user chose wins when there is one. Otherwise it falls back to the automatic
 *  label, which is a hint and not much of one: a browser cannot read its host's name, and
 *  `navigator.platform` names the operating system, so every installation on one machine
 *  produces the same string. That is exactly why naming exists - but it is optional, so this
 *  has to work without it.
 *
 *  @param chosen the name the user gave this installation, if any
 */
export function resolveDeviceName(chosen: string | null | undefined): string {
    if (chosen) {
        return chosen;
    }
    const platform = navigator.platform?.trim();
    return platform ? `Browser extension on ${platform}` : "Browser extension";
}
