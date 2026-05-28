import React, { useState } from 'react';

// Mock historical log data to display past runs on the screen
const initialHistory = [
    {
        runId: "wf-run-84920",
        timestamp: "2026-05-28 18:12:05",
        type: "Standard Order Pipeline",
        duration: "3.5s",
        status: "COMPLETED",
        summary: "Pipeline ran smoothly. Payment recovered automatically on attempt #2."
    },
    {
        runId: "wf-run-12048",
        timestamp: "2026-05-28 17:45:12",
        type: "Standard Order Pipeline",
        duration: "1.2s",
        status: "FAILED",
        summary: "Terminal failure: Inventory service endpoint unreachable."
    },
    {
        runId: "wf-run-73419",
        timestamp: "2026-05-28 16:22:40",
        type: "Standard Order Pipeline",
        duration: "3.1s",
        status: "COMPLETED",
        summary: "Execution sequence cleared all nodes concurrently."
    }
];

export default function LogsPage() {
    const [history] = useState(initialHistory);

    return (
        <div className="bg-slate-950 text-slate-100 min-h-[calc(100vh-80px)] p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Section Header */}
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-200 uppercase font-mono">
                        📜 Centralized Execution History
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        Review structural execution records, total node travel delays, and automated recovery logs managed by the core runtime engine.
                    </p>
                </div>

                {/* Log Audit Table Card */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse font-mono text-xs">
                            <thead>
                                <tr className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[10px] border-b border-slate-800">
                                    <th className="p-4 font-semibold">Instance Run ID</th>
                                    <th className="p-4 font-semibold">Trigger Timestamp</th>
                                    <th className="p-4 font-semibold">Pipeline Type</th>
                                    <th className="p-4 font-semibold">Duration</th>
                                    <th className="p-4 font-semibold">Status</th>
                                    <th className="p-4 font-semibold">Execution Summary</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/50 text-slate-300">
                                {history.map((log) => (
                                    <tr key={log.runId} className="hover:bg-slate-850/40 transition-colors">
                                        <td className="p-4 font-bold text-indigo-400">{log.runId}</td>
                                        <td className="p-4 text-slate-400">{log.timestamp}</td>
                                        <td className="p-4">{log.type}</td>
                                        <td className="p-4 text-slate-400">{log.duration}</td>
                                        <td className="p-4">
                                            <span className={`px-2 py-0.5 rounded-md font-bold text-[10px] tracking-wide ${
                                                log.status === 'COMPLETED' 
                                                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-900/50' 
                                                    : 'bg-rose-950 text-rose-400 border border-rose-900/50'
                                            }`}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-400 max-w-xs truncate" title={log.summary}>
                                            {log.summary}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

            </div>
        </div>
    );
}