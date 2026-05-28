import React, { useState } from 'react';

// Mocked structural representation of your sample_order.json blueprint for UI visualization
const mockBlueprints = [
    {
        workflowId: "e-commerce-order-processing",
        name: "Standard Customer Order Pipeline",
        description: "Orchestrates concurrent inventory allocation and payment routing before clearing freight tags.",
        tasks: [
            { id: "payment", name: "Process Customer Payment", endpoint: "/api/services/payment", depends_on: [] },
            { id: "inventory", name: "Reserve Warehouse Stock", endpoint: "/api/services/inventory", depends_on: [] },
            { id: "shipping", name: "Generate Shipping Waybill", endpoint: "/api/services/shipping", depends_on: ["payment", "inventory"] },
            { id: "notify", name: "Dispatch Confirmation Alert", endpoint: "/api/services/notify", depends_on: ["shipping"] }
        ]
    }
];

export default function Workflows() {
    const [selectedBlueprint] = useState(mockBlueprints[0]);

    return (
        <div className="bg-slate-950 text-slate-100 min-h-[calc(screen-80px)] p-6 font-sans">
            <div className="max-w-6xl mx-auto space-y-6">
                
                {/* Header Info */}
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-200 uppercase font-mono">
                        📋 Workflow Configuration Blueprints
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        View registry schemas and orchestration dependency constraints parsed by the DAG engine execution thread.
                    </p>
                </div>

                {/* Grid Splitter */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    
                    {/* Left Details Block (5 Columns) */}
                    <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                        <div>
                            <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-mono font-bold uppercase">
                                Active DAG Layout
                            </span>
                            <h2 className="text-lg font-bold text-slate-200 mt-2">{selectedBlueprint.name}</h2>
                            <p className="text-xs text-slate-400 mt-1 leading-relaxed">{selectedBlueprint.description}</p>
                        </div>

                        <div className="border-t border-slate-800 pt-4 space-y-2 font-mono text-xs text-slate-400">
                            <p><span className="text-indigo-400">Schema Key:</span> {selectedBlueprint.workflowId}</p>
                            <p><span className="text-indigo-400">Total Nodes:</span> {selectedBlueprint.tasks.length} Steps</p>
                        </div>
                    </div>

                    {/* Right JSON Structure View (7 Columns) */}
                    <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col">
                        <h3 className="text-xs font-mono font-bold text-slate-400 mb-3 border-b border-slate-800 pb-2 uppercase tracking-wider">
                            📄 Raw Blueprint Registry Schema (.json)
                        </h3>
                        <pre className="bg-slate-950 text-emerald-400 text-[11px] font-mono p-4 rounded-xl border border-slate-850 overflow-x-auto h-[350px] custom-scrollbar">
{JSON.stringify({
  workflowId: selectedBlueprint.workflowId,
  name: selectedBlueprint.name,
  tasks: selectedBlueprint.tasks.map(t => ({
    id: t.id,
    name: t.name,
    endpoint: t.endpoint,
    depends_on: t.depends_on
  }))
}, null, 2)}
                        </pre>
                    </div>

                </div>
            </div>
        </div>
    );
}