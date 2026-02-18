import { Link, useLocation } from 'react-router-dom';
import { Shield, Radio, History, Eye, GitCompareArrows, Settings } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Scan', icon: Shield },
  { path: '/monitor', label: 'Monitor', icon: Radio },
  { path: '/history', label: 'History', icon: History },
  { path: '/watchlist', label: 'Watchlist', icon: Eye },
  { path: '/compare', label: 'Compare', icon: GitCompareArrows },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Header() {
  const location = useLocation();

  return (
    <header className="border-b border-border bg-bg-card/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <Shield size={18} className="text-accent" />
            </div>
            <span className="text-lg font-bold tracking-tight">
              Trench<span className="text-accent">able</span><span className="text-text-muted font-normal text-xs">.gold</span>
            </span>
          </Link>

          {/* Navigation */}
          <nav className="flex items-center gap-1">
            {navItems.map(({ path, label, icon: Icon }) => {
              const isActive = path === '/'
                ? location.pathname === '/' || location.pathname.startsWith('/scan')
                : location.pathname === path;

              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-dim hover:text-text hover:bg-bg-card-hover'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
