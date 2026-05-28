import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function OrderPage() {
    const navigate = useNavigate();
    
    // In-memory checkout state variables
    const [email, setEmail] = useState('patil.sharyu@example.com');
    const [amount, setAmount] = useState('249.99');
    const [items, setItems] = useState('Premium Mechanical Keyboard, Wireless Mouse');

    const handleProceedToCheckout = (e) => {
        e.preventDefault();
        
        // Package payload data tightly to pass it onto the Dashboard page
        const orderPayload = {
            email,
            amount: parseFloat(amount),
            items: items.split(',').map(i => i.trim())
        };

        console.log("[MARKETPLACE] Dispatching configuration properties payload:", orderPayload);
        
        // Redirect right into the visual tracking screen
        navigate('/dashboard', { state: { incomingOrder: orderPayload } });
    };

    return (
        <div className="bg-slate-950 text-slate-100 min-h-[calc(100vh-80px)] p-6 font-sans">
            <div className="max-w-md mx-auto space-y-6 pt-6">
                
                {/* Section Title Header */}
                <div className="text-center">
                    <h1 className="text-xl font-bold tracking-tight text-slate-200 uppercase font-mono">
                        🛍️ Mock Marketplace Checkout
                    </h1>
                    <p className="text-xs text-slate-400 mt-1">
                        Configure transactional variables to mock checkout payloads for the Orchestrator DAG network layer.
                    </p>
                </div>

                {/* Form Elements */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                    <form onSubmit={handleProceedToCheckout} className="space-y-4 font-mono text-xs text-slate-300">
                        
                        {/* Customer Email Input */}
                        <div className="flex flex-col space-y-2">
                            <label className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                                Customer Contact Email
                            </label>
                            <input 
                                type="email" 
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>

                        {/* Order Cost Input */}
                        <div className="flex flex-col space-y-2">
                            <label className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                                Billable Target Value ($ USD)
                            </label>
                            <input 
                                type="number" 
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                                required
                            />
                        </div>

                        {/* Item Bundles Textarea */}
                        <div className="flex flex-col space-y-2">
                            <label className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                                Item Registry List (Comma Separated)
                            </label>
                            <textarea 
                                rows="3"
                                value={items}
                                onChange={(e) => setItems(e.target.value)}
                                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
                                required
                            />
                        </div>

                        {/* Form Submission Confirmation Button */}
                        <button 
                            type="submit"
                            className="w-full mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-sans font-medium py-2.5 rounded-xl transition-all shadow-md text-sm uppercase tracking-wide"
                        >
                            Confirm & Stage Workflow
                        </button>

                    </form>
                </div>

            </div>
        </div>
    );
}