import React, { useState, useEffect, useCallback } from 'react';
import ReactFlow, { MiniMap, Controls, Background, useNodesState, useEdgesState } from 'reactflow';
import axios from 'axios';
import { socket } from '../services/socket';
import CustomNode from '../components/customNode';
import TerminalLogs from '../components/terminalLogs';
import 'reactflow/dist/style.css';

// Register our custom styling wrapper inside React Flow's node engine
const nodeTypes = {
    workflowNode: CustomNode,
};

const BACKEND_API_URL = 'http://localhost:4000/api/workflows';

export default function Dashboard() {
    const [instanceId, setInstanceId] = useState(null);
    const [workflowStatus, setWorkflowStatus] = useState('IDLE');
    const [logs, setLogs] = useState([]);
    
    // React Flow layout control state hooks
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // 1. Define the Initial Blueprint Visual Coordinates (X, Y layout)
    const initializeGraph = useCallback((taskStates = {}) => {
        const initialNodes = [
            {
                id: 'payment',
                type: 'workflowNode',
                data: { label: '💳 Payment Service', status: taskStates.payment?.status || 'PENDING' },
                position: { x: 100, y: 100 },
            },
            {
                id: 'inventory',
                type: 'workflowNode',
                data: { label: '📦 Inventory Service', status: taskStates.inventory?.status || 'PENDING' },
                position: { x: 450, y: 100 },
            },
            {
                id: 'shipping',
                type: 'workflowNode',
                data: { label: '🚚 Shipping Service', status: taskStates.shipping?.status || 'PENDING' },
                position: { x: 275, y: 250 },
            },
            {
                id: 'notify',
                type: 'workflowNode',
                data: { label: '🔔 Notification Service', status: taskStates.notify?.status || 'PENDING' },
                position: { x: 275, y: 380 },
            },
        ];

        const initialEdges = [
            { id: 'e-pay-ship', source: 'payment', target: 'shipping', animated: taskStates.payment?.status === 'RUNNING' },
            { id: 'e-inv-ship', source: 'inventory', target: 'shipping', animated: taskStates.inventory?.status === 'RUNNING' },
            { id: 'e-ship-not', source: 'shipping', target: 'notify', animated: taskStates.shipping?.status === 'RUNNING' },
        ];

        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [setNodes, setEdges]);

    // Load empty chart grid onto canvas when dashboard mounts
    useEffect(() => {
        initializeGraph();
    }, [initializeGraph]);

    // 2. Real-Time Socket.IO Streaming Event Listeners
    useEffect(() => {
        socket.connect();

        // Listens for real-time orchestrator updates dispatched by Vedant's backend engine
        socket.on('workflow_update', (updateEvent) => {
            if (updateEvent.id === instanceId || !instanceId) {
                setInstanceId(updateEvent.id);
                setWorkflowStatus(updateEvent.status);
                setLogs(updateEvent.logs || []);
                
                // Dynamically re-render graph coloring based on incoming event states
                initializeGraph(updateEvent.tasks);
            }
        });

        return () => {
            socket.off('workflow_update');
            socket.disconnect();
        };
    }, [instanceId, initializeGraph]);

    // 3. Trigger Backend Orchestrator DAG Pipeline via API Call
    const handleTriggerPipeline = async () => {
        try {
            setLogs(["[SYSTEM] Firing boot request to central execution core..."]);
            setWorkflowStatus('RUNNING');
            
            const response = await axios.post(`${BACKEND_API_URL}/start-workflow`, {
                workflowId: "e-commerce-order-processing"
            });

            if (response.data.success) {
                setInstanceId(response.data.workflowInstanceId);
            }
        } catch (error) {
            setLogs(prev => [...prev, `[FATAL GATEWAY ERROR] Connect failed: ${error.message}`]);
            setWorkflowStatus('FAILED');
        }
    };

    // 4. Manual Retry trigger method for Member 2's failure handling demo sequence
    const handleManualRetry = async (taskId) => {
        if (!instanceId) return;
        try {
            setLogs(prev => [...prev, `[SYSTEM] Dispatched manual retry request hook for node: [${taskId}]`]);
            await axios.post(`${BACKEND_API_URL}/retry-task/${instanceId}`, { taskId });
        } catch (error) {
            console.error("Retry transmission breakdown:", error);
        }
    };

    return (
        <div className="bg-slate-950 text-slate-100 min-h-screen font-sans flex flex-col p-6">
            {/* Upper Dashboard Controls Row */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-800 pb-4 mb-6 gap-4">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent tracking-tight">
                        FLOWORCHESTRA CONSOLE
                    </h1>
                    <div className="flex items-center space-x-3 mt-1 font-mono text-xs">
                        <p className="text-indigo-400">Run ID: <span className="text-slate-400">{instanceId || 'unassigned'}</span></p>
                        <span className="text-slate-700">•</span>
                        <p className="text-indigo-400">Pipeline State: 
                            <span className={`ml-1 font-bold ${workflowStatus === 'COMPLETED' ? 'text-emerald-400' : workflowStatus === 'FAILED' ? 'text-rose-400' : workflowStatus === 'RUNNING' ? 'text-amber-400' : 'text-slate-500'}`}>
                                {workflowStatus}
                            </span>
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3 w-full sm:w-auto">
                    {workflowStatus === 'FAILED' && (
                        <button 
                            onClick={() => handleManualRetry('payment')}
                            className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl font-medium shadow-md text-xs transition-all font-mono"
                        >
                            🔄 Force Payment Retry
                        </button>
                    )}
                    <button 
                        onClick={handleTriggerPipeline}
                        disabled={workflowStatus === 'RUNNING'}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white px-5 py-2.5 rounded-xl font-medium shadow-lg shadow-indigo-600/10 transition-all text-sm flex items-center space-x-2 w-full sm:w-auto justify-center"
                    >
                        🚀 Trigger DAG Workflow
                    </button>
                </div>
            </div>

            {/* Split Screen Application Canvas */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-grow items-stretch">
                {/* Graph Visualizer Display (8 Columns) */}
                <div className="lg:col-span-8 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative min-h-[450px] lg:min-h-[550px] shadow-inner">
                    <ReactFlow 
                        nodes={nodes} 
                        edges={edges} 
                        nodeTypes={nodeTypes}
                        onNodesChange={onNodesChange}
                        onEdgesChange={onEdgesChange}
                        fitView
                    >
                        <Background color="#1e293b" gap={20} size={1} />
                        <Controls className="!bg-slate-800 !border-slate-700 !fill-white [&>button]:!border-slate-700 [&>button]:!text-white" />
                        <MiniMap nodeColor={() => '#0f172a'} maskColor="rgba(15, 23, 42, 0.7)" className="!bg-slate-9ced border !border-slate-800" />
                    </ReactFlow>
                </div>

                {/* System Stream Terminal Component (4 Columns) */}
                <div className="lg:col-span-4 flex flex-col">
                    <TerminalLogs logs={logs} />
                </div>
            </div>
        </div>
    );
}