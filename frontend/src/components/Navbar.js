import React from 'react';
import { Link, useLocation } from 'react-router-dom';

export default function Navbar() {
    const location = useLocation();

    const navItems = [
        { name: 'Console Dashboard', path: '/dashboard' },
        { name: 'Mock Orders', path: '/orders' },
        { name: 'DAG Blueprints', path: '/workflows' },
        { name: 'System Logs', path: '/logs' }
    ];

    return (
        <nav className="bg-slate-900/60 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50 px-6 py-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
                {/* Brand Logo Identity */}
                <div className="flex items-center space-x-2">
                    <span className="text-xl font-black tracking-wider text-indigo-400 font-mono">FLOW</span>
                    <span className="text-xs bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-md font-mono font-semibold">
                        v1.0.0
                    </span>
                </div>

                {/* Navigation Link Interceptors */}
                <div className="flex space-x-1 sm:space-x-4">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`text-xs sm:text-sm px-3 py-1.5 rounded-lg font-medium transition-all duration-200 ${
                                    isActive 
                                        ? 'bg-slate-800 text-white shadow-sm border border-slate-700' 
                                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
                                }`}
                            >
                                {item.name}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </nav>
    );
}