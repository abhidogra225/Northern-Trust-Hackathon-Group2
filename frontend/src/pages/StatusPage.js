import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { socket } from '../services/socket';

export default function StatusPage() {
    const [backendLive, setBackendLive] = useState(false);
    const [socketLive, setSocketLive] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        const verifySystemHealth = async () => {
            setChecking(true);
            
            // 1. Check HTTP REST API Gateway Health
            try {
                const response = await axios.get('http://localhost:4000/');
                if (response.status === 200 && response.data.success) {
                    setBackendLive(true);
                }
            } catch (err) {
                setBackendLive(false);
            }

            // 2. Check WebSocket Engine Stream Connection Health
            setSocketLive(socket.connected);

            setChecking(false);
        };

        verifySystemHealth();
        const interval = setInterval(verifySystemHealth, 5000); // Re-scan engine channels every 5s

        return () => clearInterval(interval);
    }, []);

    const serviceNodes = [
        { name: "Payment Processing Node", endpoint: "/api/services/payment", port: "4000" },
        { name: "Inventory Allocation Node", endpoint: "/api/services/inventory", port: "4000" },
        { name: "Logistics Shipping Node", endpoint: "/api/services/shipping", port: "4000" },
        { name: "Notification Alert Node", endpoint: "/api/services/notify", port: "4000" }
    ];

    return (
        <div className="bg-slate-950 text-slate-100 min-h-[calc(100vh-80px)] p-6 font-sans">
            <div className="max-w-4xl mx-auto space-y-6">
                
                {/* Header Title */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold tracking-tight text-slate-200 uppercase font-mono">
                            🛡️ Core Engine Diagnostic Monitor
                        </h1>
                        <p className="text-xs text-slate-400 mt-1">
                            Live system status monitoring of container channels and execution event loops.
                        </p>
                    </div>
                    {checking && <span className="text-[10px] font-mono text-indigo-400 animate-pulse">[SCANNING...]</span>}
                </div>

                {/* Main Pipeline Gateway Health Flags */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Gateway Box */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-md">
                        <div className="font-mono text-xs">
                            <h3 className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Orchestrator Gateway API</h3>
                            <p className="text-slate-500 mt-0.5">http://localhost:4000/</p>
                        </div>
                        <span className={`h-2.5 w-2.5 rounded-full ring-4 ${backendLive ? 'bg-emerald-400 ring-emerald-500/20' : 'bg-rose-400 ring-rose-500/20'}`} />
                    </div>

                    {/* WebSocket Stream Box */}
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between shadow-md">
                        <div className="font-mono text-xs">
                            <h3 className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">Real-Time Event WS Channel</h3>
                            <p className="text-slate-500 mt-0.5">Socket.IO State Thread</p>
                        </div>
                        <span className={`h-2.5 w-2.5 rounded-full ring-4 ${socketLive ? 'bg-emerald-400 ring-emerald-500/20' : 'bg-rose-400 ring-rose-500/20'}`} />
                    </div>

                </div>

                {/* Cluster Microservice Pod Registries */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
                    <h3 className="text-xs font-mono font-bold text-slate-400 mb-4 uppercase tracking-wider border-b border-slate-800 pb-2">
                        📡 Mock App Microservice Pod Clusters ({serviceNodes.length})
                    </h3>
                    
                    <div className="space-y-3 font-mono text-xs">
                        {serviceNodes.map((node, idx) => (
                            <div key={idx} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-850">
                                <div>
                                    <p className="text-slate-200 font-semibold">{node.name}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5">{node.endpoint} (Port {node.port})</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-900/40">ONLINE</span>
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}