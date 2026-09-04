/**
 *  Mints an identifier for a new record.
 *
 *  A UUID version 7 rather than the version 4 `crypto.randomUUID()` produces. Both are
 *  unguessable and both are unique for every practical purpose - v7 still carries 74 random
 *  bits, and two of them can only collide if they were generated in the same millisecond -
 *  but a v7 begins with a 48-bit timestamp, so identifiers minted later sort after ones
 *  minted earlier.
 *
 *  That matters because these identifiers are now the primary keys of the backend's tables.
 *  Random keys scatter inserts across the whole B-tree, dirtying a different page almost
 *  every time; time-ordered keys append at the right-hand edge, which is one warm page. On a
 *  links table that only ever grows, that is the difference between an index that stays cheap
 *  and one that slowly stops fitting in cache.
 *
 *  Layout, from RFC 9562: 48 bits of Unix milliseconds, 4 bits of version, 12 random,
 *  2 bits of variant, 62 random.
 */
export function uid(): string {

    // Bytes 6 to 15 of the identifier; bytes 0 to 5 are the timestamp.
    const random = new Uint8Array(10);
    crypto.getRandomValues(random);

    // Version 7 goes in the high nibble of byte 6, the variant marker in the high bits of
    // byte 8. Both overwrite random bits rather than being added alongside them.
    random[0] = (random[0] & 0x0f) | 0x70;
    random[2] = (random[2] & 0x3f) | 0x80;

    const timestampHex = Date.now().toString(16).padStart(12, "0").slice(-12);
    const randomHex = Array.from(random, byte => byte.toString(16).padStart(2, "0")).join("");

    return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}`
        + `-${randomHex.slice(0, 4)}-${randomHex.slice(4, 8)}-${randomHex.slice(8, 20)}`;
}
