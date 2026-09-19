import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./auth";

export function Layout() {
  const { ready, user, signOut } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <span className="brand-mark">SS</span>
          <span>
            <strong>SmartShop</strong>
            <em>Catalogue & checkout</em>
          </span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/">Shop</NavLink>
          <NavLink to="/cart">Cart</NavLink>
          <NavLink to="/orders">Orders</NavLink>
          <NavLink to="/chat">Chat</NavLink>
          {ready && user ? (
            <>
              <span className="who">
                {user.displayName}
                {user.isPremium ? " · Premium" : ""}
              </span>
              <button type="button" className="linkish" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login">Sign in</NavLink>
              <NavLink to="/signup" className="cta">
                Sign up
              </NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
