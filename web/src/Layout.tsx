import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { getCart } from "./api";
import { useAuth } from "./auth";
import { CATEGORIES, categoryPath } from "./catalog";
import { useChat } from "./chat";
import { ChatPanel } from "./pages/ChatPage";

export function Layout() {
  const { ready, user, isAdmin, signOut } = useAuth();
  const { paneVisible, toggleChat } = useChat();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const [cartCount, setCartCount] = useState(0);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const headerNode = headerRef.current;
    if (!headerNode) {
      return;
    }
    const measured: HTMLElement = headerNode;
    function applyHeight() {
      document.documentElement.style.setProperty(
        "--store-header-height",
        `${measured.offsetHeight}px`,
      );
    }
    applyHeight();
    const observer = new ResizeObserver(applyHeight);
    observer.observe(measured);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!user) {
      setCartCount(0);
      return;
    }
    let cancelled = false;
    function loadCount() {
      getCart()
        .then((result) => {
          if (!cancelled) {
            setCartCount(result.items.reduce((sum, item) => sum + item.quantity, 0));
          }
        })
        .catch(() => {
          if (!cancelled) {
            setCartCount(0);
          }
        });
    }
    loadCount();
    window.addEventListener("smartshop:cart-changed", loadCount);
    return () => {
      cancelled = true;
      window.removeEventListener("smartshop:cart-changed", loadCount);
    };
  }, [user, location.pathname]);

  return (
    <div className="shell">
      <header className="store-header" ref={headerRef}>
        <NavLink to="/" end className="brand">
          <span className="brand-mark">SS</span>
          <span>
            <strong>SmartShop</strong>
            <em>Everyday essentials</em>
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
            placeholder="Search for products, categories…"
            aria-label="Search products"
          />
        </form>
        <nav className="header-nav" aria-label="Store">
          <NavLink to="/" end>
            Home
          </NavLink>
          {CATEGORIES.filter((category) => category.slug !== "home").map((category) => (
            <NavLink key={category.slug} to={categoryPath(category.slug)}>
              {category.label}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {isAdmin ? <NavLink to="/admin/reports">Reports</NavLink> : null}
          {user ? (
            <button
              type="button"
              className={`header-chat${paneVisible ? " is-open" : ""}`}
              aria-expanded={paneVisible}
              aria-controls="shop-assistant-pane"
              onClick={toggleChat}
            >
              Chat
            </button>
          ) : (
            <NavLink to="/chat">Chat</NavLink>
          )}
          <NavLink to="/cart" className="cart-link" aria-label="Cart">
            Cart
            {cartCount > 0 ? <span className="cart-badge">{cartCount}</span> : null}
          </NavLink>
          {ready && user ? (
            <>
              <span className="who">{user.displayName}</span>
              <button type="button" className="linkish" onClick={() => void signOut()}>
                Sign out
              </button>
            </>
          ) : (
            <NavLink to="/login">Sign in</NavLink>
          )}
        </div>
      </header>
      <main className="content">
        <Outlet />
      </main>
      {user ? <ChatPanel key={user.userId} /> : null}
      <footer className="site-footer">
        <div>
          <NavLink to="/" className="brand">
            <span className="brand-mark">SS</span>
            <span>
              <strong>SmartShop</strong>
              <em>Everyday essentials</em>
            </span>
          </NavLink>
        </div>
        <nav>
          <Link to="/orders">Orders</Link>
          {user ? (
            <button type="button" className="footer-chat" onClick={toggleChat}>
              Chat
            </button>
          ) : (
            <Link to="/chat">Chat</Link>
          )}
          <Link to="/cart">Cart</Link>
          <Link to="/login">Sign in</Link>
        </nav>
        <p>© {new Date().getFullYear()} SmartShop. All rights reserved.</p>
      </footer>
    </div>
  );
}
