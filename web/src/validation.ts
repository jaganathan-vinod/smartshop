export function passwordPolicyIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 8) {
    issues.push("at least 8 characters");
  }
  if (!/[A-Z]/.test(password)) {
    issues.push("an uppercase letter");
  }
  if (!/[a-z]/.test(password)) {
    issues.push("a lowercase letter");
  }
  if (!/[0-9]/.test(password)) {
    issues.push("a number");
  }
  return issues;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function errorName(error: unknown): string {
  return error && typeof error === "object" && "name" in error
    ? String(error.name)
    : "";
}

export function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === "ApiRequestError" && "code" in error && error.code === "NETWORK_ERROR") {
    return true;
  }
  return /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

export function cognitoErrorMessage(error: unknown): string {
  switch (errorName(error)) {
    case "AliasExistsException":
    case "UsernameExistsException":
      return "An account with this email already exists. Sign in instead.";
    case "UserNotConfirmedException":
      return "Confirm your email before signing in.";
    case "NotAuthorizedException":
      return "Incorrect email or password.";
    case "CodeMismatchException":
      return "That verification code is incorrect.";
    case "ExpiredCodeException":
      return "That verification code has expired.";
    case "InvalidPasswordException":
      return "Password does not meet the required policy.";
    case "LimitExceededException":
      return "Too many attempts. Try again later.";
    case "UserNotFoundException":
      return "Incorrect email or password.";
    case "UserAlreadyAuthenticatedException":
      return "You are already signed in.";
    default:
      if (isNetworkFailure(error)) {
        return "Signed in, but SmartShop could not be reached. Try again.";
      }
      if (error instanceof Error && error.name === "ApiRequestError") {
        return "Signed in, but the profile could not be loaded. Try again.";
      }
      return error instanceof Error ? error.message : "Something went wrong.";
  }
}

export function isUnconfirmedUser(error: unknown): boolean {
  return errorName(error) === "UserNotConfirmedException";
}

export function isUsernameTaken(error: unknown): boolean {
  const name = errorName(error);
  return name === "UsernameExistsException" || name === "AliasExistsException";
}

export function isAlreadyAuthenticated(error: unknown): boolean {
  return (
    errorName(error) === "UserAlreadyAuthenticatedException" ||
    (error instanceof Error && /already a signed in user/i.test(error.message))
  );
}
