type TokenGetter = () => Promise<string | null>;
let getter: TokenGetter = async () => null;

export function setTokenGetter(next: TokenGetter) {
  getter = next;
  return () => { if (getter === next) getter = async () => null; };
}
export function getSessionToken() { return getter(); }
