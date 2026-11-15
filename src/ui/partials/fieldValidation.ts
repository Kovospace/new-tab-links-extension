import { t } from '../../i18n/i18n';

/**
 *  What a field will accept, and what to say when it does not.
 *
 *  The rules live here rather than in the dialog because they are the interesting part and
 *  the dialog is not testable: a browser dialog needs a browser. They are also the same rules
 *  the backend applies, and the reason for saying them here first is not politeness. A name
 *  the account cannot store does not merely fail to reach it - `@Size` is validated over the
 *  whole push, so one over-long name comes back as a 400 for the entire batch and nothing at
 *  all is applied. It would sit in local state stopping every other change from syncing until
 *  somebody found it. Refusing it in the dialog is what keeps it out.
 */

/** How a field behaves and what it is checked against. */
export type FieldType = 'string' | 'url' | 'password' | 'checkbox';

/** What one field will accept. */
export interface FieldConstraints {

    type: FieldType;

    /** Whether it has to be filled in. Blank means whitespace too. */
    required?: boolean;

    /**
     *  Longest value the field takes, in characters, compared after trimming.
     *
     *  Trimmed because that is what is stored: a name is trimmed on its way into state, so a
     *  field refused for surrounding spaces would be refusing something that was never going
     *  to be saved.
     */
    maxLength?: number;

    /**
     *  What the confirming callback receives this field's value under.
     *
     *  Without it the key is the label, camel-cased - which was fine while there was one
     *  wording per field and stopped being fine the moment there were two. A dialog whose
     *  labels are translated would hand `addWorkspace` a `nazovPracovnehoPriestoru` in Slovak
     *  and a `workspaceName` in English, and the callback can only be written for one of them.
     *  So a field that matters says what it is called in code, and the label is free to say
     *  whatever the reader's language says.
     */
    key?: string;

    /** A checkbox's state when the dialog opens; unticked unless it says so. */
    checked?: boolean;

    /**
     *  The key of the field a checkbox switches on: unticked, that field is drawn disabled,
     *  is not checked against its constraints, and hands the callback an empty value. For a
     *  question that only means something after a yes - what to call a device that is not
     *  going to synchronise is not worth asking.
     */
    enables?: string;
}

/**
 *  Schemes an address is never accepted under.
 *
 *  `javascript:` is the one that matters. A link is rendered as an anchor on the new tab page,
 *  which is an extension page, and a `javascript:` href clicked there runs in that page - with
 *  the extension's own storage and its own origin behind it. `data:` and `vbscript:` are the
 *  same trick in other clothes. Everything else is allowed through, `file:` included: those
 *  are addresses somebody may genuinely want to keep, and refusing them would be tidiness at
 *  the user's expense.
 */
const REFUSED_SCHEMES = ['javascript:', 'data:', 'vbscript:', 'blob:'];

/**
 *  An address as it would be stored.
 *
 *  A scheme is assumed rather than demanded: "example.com" is what people type, and https is
 *  what they mean by it.
 */
export function normalizeUrl(value: string): string {
    const trimmed = value.trim();
    return trimmed.includes('://') ? trimmed : `https://${trimmed}`;
}

/**
 *  Checks one value against one field's constraints.
 *
 *  @param label       what the field is called, which is how it is named in the message
 *  @param value       what the user has typed, untrimmed
 *  @param constraints what the field will accept
 *  @return what is wrong with it, worded for the user, or null when nothing is
 */
export function validateField(
    label: string,
    value: string,
    constraints: FieldConstraints
): string | null {

    // A checkbox has no wrong answer: ticked or not, both are things somebody meant.
    if (constraints.type === 'checkbox') {
        return null;
    }

    const trimmed = value.trim();

    if (constraints.required && trimmed.length === 0) {
        return t('dialogs.validation.required', { label });
    }

    // An empty optional field is finished with here: the rules below are about what a value
    // says, and it does not have one.
    if (trimmed.length === 0) {
        return null;
    }

    if (constraints.maxLength !== undefined && trimmed.length > constraints.maxLength) {
        return t('dialogs.validation.tooLong',
            { label, max: constraints.maxLength, length: trimmed.length });
    }

    if (constraints.type === 'url') {
        return urlProblem(label, trimmed);
    }

    return null;
}

/** What is wrong with an address, or null when it is one. */
function urlProblem(label: string, value: string): string | null {

    // Parsed as typed first, and only then with a scheme assumed. That order is the whole
    // guard: "javascript:alert(1)" has no "://", so assuming a scheme first would turn it
    // into "https://javascript:alert(1)", which fails to parse and would be reported as a
    // typo rather than as the thing it is.
    const asTyped = parseUrl(value);

    if (asTyped && REFUSED_SCHEMES.includes(asTyped.protocol)) {
        // Said plainly rather than as "invalid": somebody who typed this meant it, and the
        // reason it is refused is not that it is malformed.
        return t('dialogs.validation.refusedScheme',
            { label, scheme: asTyped.protocol.replace(':', '') });
    }

    const parsed = asTyped ?? parseUrl(normalizeUrl(value));

    if (!parsed) {
        return t('dialogs.validation.notAWebAddress', { label });
    }

    // A host is demanded only of the schemes that have one. `file:` addresses have none by
    // design, and neither does `mailto:` - refusing those would be tidiness at the user's
    // expense, and neither can run anything.
    const needsHost = parsed.protocol === 'http:' || parsed.protocol === 'https:';
    if (needsHost && !parsed.hostname) {
        return t('dialogs.validation.notAWebAddress', { label });
    }

    return null;
}

/** The address, or null when it is not one at all. */
function parseUrl(value: string): URL | null {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}

/**
 *  Checks every field at once.
 *
 *  @param values      what is in the fields, keyed however the caller keys them
 *  @param constraints the constraints of those same fields, keyed the same way
 *  @param labels      what each field is called, keyed the same way
 *  @return one message per field that has a problem; empty when the form is fit to submit
 */
export function validateFields(
    values: Record<string, string>,
    constraints: Record<string, FieldConstraints>,
    labels: Record<string, string>
): Record<string, string> {

    const problems: Record<string, string> = {};

    for (const [key, fieldConstraints] of Object.entries(constraints)) {
        const problem = validateField(
            labels[key] ?? key,
            values[key] ?? '',
            fieldConstraints);
        if (problem) {
            problems[key] = problem;
        }
    }

    return problems;
}
