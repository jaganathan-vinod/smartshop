const AUTH_PATHS = new Set(["/login", "/signup", "/confirm"]);

export function isAuthRoute(pathname: string): boolean {
  return AUTH_PATHS.has(pathname);
}

export function isChatRoute(pathname: string): boolean {
  return pathname === "/chat";
}

export function storeLocationKey(pathname: string, search = ""): string | null {
  if (isAuthRoute(pathname) || isChatRoute(pathname)) {
    return null;
  }
  return `${pathname}${search}`;
}

export function chatRedirectPath(lastStorePath: string): string {
  return lastStorePath || "/";
}

export function chatPaneVisible(input: {
  open: boolean;
  signedIn: boolean;
  pathname: string;
}): boolean {
  return input.open && input.signedIn && !isAuthRoute(input.pathname);
}
