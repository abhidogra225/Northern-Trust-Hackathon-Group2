import React, { useEffect, useRef } from 'react';

export default function TerminalLogs({ logs }) {
    const terminalEndRef = useRef(null);

    // Auto scroll mechanisms to snap down automatically when new logs arrive
    useEffect(() => {
        terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const getLogColor = (text) => {
        if (text.includes('❌') || text.includes('FAILED')) return 'text-rose-400';
        if (text.includes('✅') || text.includes('🎉') || text.includes('SUCCESS')) return 'text-emerald-400';
        if (text.includes('⚠️') || text.includes('retry')) return 'text-amber-400';
        return 'text-slate-300';
    };

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-full overflow-hidden">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-400 mb-2 border-b border-slate-800 pb-2">
                📟 Orchestrator System Console Logs
            </h3>
            <div className="flex-grow overflow-y-auto font-mono text-[11px] space-y-2 bg-slate-950 p-3 rounded-xl border border-slate-850 h-[400px]">
                {logs.length === 0 ? (
                    <p className="text-slate-600 italic">[System standing by. Trigger a workflow to pipe events...]</p>
                ) : (
                    logs.map((log, index) => (
                        <p key={index} className={getLogColor(log)}>
                            {log}
                        </p>
                    ))
                )}
                <div ref={terminalEndRef} />
            </div>
        </div>
    );
}