import { type FormEvent } from "react";
import { Link, NavLink, Outlet, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./auth";
import { CATEGORIES, categoryPath } from "./catalog";

export function Layout() {
  const { ready, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";

  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" end className="brand">
          <span className="brand-mark">SS</span>
          <span>
            <strong>SmartShop</strong>
            <em>Everyday catalogue</em>
          </span>
        </NavLink>
        <form
          className="search search-top"
          key={q}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("q") ?? "").trim();
            navigate(value ? `/?q=${encodeURIComponent(value)}` : "/");
          }}
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search the catalogue"
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>
        <nav className="nav">
          <NavLink to="/" end>
            Shop
          </NavLink>
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
      <nav className="catnav" aria-label="Categories">
        {CATEGORIES.map((category) => (
          <div className="catnav-item" key={category.slug}>
            <NavLink to={categoryPath(category.slug)}>{category.label}</NavLink>
            <div className="catnav-panel">
              <p>{category.blurb}</p>
              <Link to={categoryPath(category.slug)}>Shop {category.label}</Link>
            </div>
          </div>
        ))}
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
