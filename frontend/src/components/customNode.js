import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';

const statusStyles = {
    PENDING: 'bg-slate-900 border-slate-700 text-slate-400',
    RUNNING: 'bg-indigo-950 border-indigo-500 text-indigo-300 animate-pulse ring-2 ring-indigo-500/30',
    SUCCESS: 'bg-emerald-950 border-emerald-500 text-emerald-300 border-2',
    FAILED: 'bg-rose-950 border-rose-500 text-rose-300 border-2 shadow-lg shadow-rose-950/50',
    RETRYING: 'bg-amber-950 border-amber-500 text-amber-300 animate-bounce border-2'
};

const CustomNode = ({ data }) => {
    const currentStatus = data.status || 'PENDING';

    return (
        <div className={`px-4 py-3 rounded-xl border font-mono text-xs min-w-[150px] shadow-md transition-all duration-300 ${statusStyles[currentStatus]}`}>
            {/* Input target wire connection handle */}
            <Handle type="target" position={Position.Top} className="!bg-slate-600 !w-2 !h-2" />
            
            <div className="flex flex-col space-y-1">
                <span className="font-semibold tracking-wide text-slate-200">{data.label}</span>
                <span className="text-[10px] opacity-80 uppercase tracking-widest">{currentStatus}</span>
            </div>

            {/* Output source wire connection handle */}
            <Handle type="source" position={Position.Bottom} className="!bg-slate-600 !w-2 !h-2" />
        </div>
    );
};

export default memo(CustomNode);