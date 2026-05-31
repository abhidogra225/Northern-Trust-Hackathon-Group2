import { useState } from 'react';
import { startWorkflow } from '../services/api';

const PRESETS = [
  {
    name: '✓ Success Scenario',
    description: 'Runs entire workflow to completion successfully.',
    data: {
      customerName: 'Abhi Dogra',
      email: 'abhi.dogra@northerntrust.com',
      phone: '+1 555 019 9999',
      itemId: 'ITEM-001',
      quantity: 2,
      amount: '250',
      cardNumber: '4111 2222 3333 4444',
      deliveryAddress: 'Northern Trust HQ, Chicago, IL, USA',
    }
  },
  {
    name: '✕ Card Declined Failure',
    description: 'Declined card ending in 0000 triggers payment failures and retries, eventually running the notification failure fallback.',
    data: {
      customerName: 'John Doe',
      email: 'john.doe@example.com',
      phone: '+1 555 010 0000',
      itemId: 'ITEM-001',
      quantity: 1,
      amount: '80',
      cardNumber: '4111 2222 3333 0000',
      deliveryAddress: '123 Main Street, Springfield, USA',
    }
  },
  {
    name: '‖ Human Approval Step',
    description: 'Amount > $10,000 pauses payment for human approval. After you approve in the detail view, the full order completes successfully.',
    data: {
      customerName: 'Rich Buyer',
      email: 'rich@example.com',
      phone: '+1 555 999 1111',
      itemId: 'ITEM-003',
      quantity: 5,
      amount: '15000',
      cardNumber: '4111 2222 3333 4444',
      deliveryAddress: 'Penthouse Suite, Beverly Hills, CA, USA',
    }
  },
  {
    name: '● Shipping Retry Simulation',
    description: 'Address containing "FAIL" triggers temporary shipping carrier pickup failure on attempt 1, succeeding on retry.',
    data: {
      customerName: 'Mark Smith',
      email: 'mark.smith@example.com',
      phone: '+1 555 456 7890',
      itemId: 'ITEM-001',
      quantity: 3,
      amount: '450',
      cardNumber: '4111 2222 3333 4444',
      deliveryAddress: 'FAIL - Temporary Carrier Pickup Block',
    }
  }
];

const initialForm = {
  customerName: '',
  email: '',
  phone: '',
  itemId: 'ITEM-001',
  quantity: 1,
  amount: '',
  cardNumber: '',
  deliveryAddress: '',
};

export default function StartWorkflow({ onOpenWorkflow }) {
  const [formData, setFormData] = useState(initialForm);
  const [activePreset, setActivePreset] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);

  function applyPreset(index) {
    setFormData(PRESETS[index].data);
    setActivePreset(index);
  }

  function onChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setActivePreset(null);
  }

  async function onSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccessData(null);

    const inputData = {
      customer_name: formData.customerName,
      customer_email: formData.email,
      customer_phone: formData.phone,
      item_id: formData.itemId,
      quantity: Number(formData.quantity),
      amount: Number(formData.amount),
      card_number: formData.cardNumber,
      address: formData.deliveryAddress,
    };

    const { data, error: apiError } = await startWorkflow(inputData);
    if (apiError) {
      setError(apiError);
      setSubmitting(false);
      return;
    }

    setSuccessData(data);
    setSubmitting(false);
    setFormData(initialForm);
    setActivePreset(null);
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Start New Order Workflow</h2>
          <p className="page-subtitle">Select a demo preset or enter custom customer details below to launch the orchestrator DAG.</p>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontFamily: 'var(--font-display)', marginBottom: '0.85rem', fontSize: '1.15rem' }}>Demo Preset Scenarios</h3>
        <div className="preset-container">
          {PRESETS.map((p, idx) => (
            <button
              key={p.name}
              type="button"
              className={`preset-btn ${activePreset === idx ? 'active' : ''}`}
              onClick={() => applyPreset(idx)}
            >
              {p.name}
            </button>
          ))}
        </div>
        {activePreset !== null ? (
          <p className="page-subtitle" style={{ fontSize: '0.85rem', background: 'rgba(255,255,255,0.02)', padding: '0.5rem 0.75rem', borderRadius: '8px', borderLeft: '3px solid var(--color-primary)' }}>
            <strong>Preset Focus:</strong> {PRESETS[activePreset].description}
          </p>
        ) : null}
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {successData ? (
        <div className="banner success">
          <strong>Workflow created successfully.</strong>
          <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)', margin: '0.25rem 0' }}>
            Instance ID: {successData.workflowInstanceId}
          </div>
          <button type="button" className="link-inline" onClick={() => onOpenWorkflow(successData.workflowInstanceId)}>
            View active workflow details & DAG →
          </button>
        </div>
      ) : null}

      <form className="form-grid card" onSubmit={onSubmit}>
        <div className="field-group">
          <h3>Customer Information</h3>
          <label>
            Customer Name
            <input name="customerName" value={formData.customerName} onChange={onChange} placeholder="Jane Doe" required />
          </label>

          <label>
            Email Address
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={onChange}
              placeholder="jane@example.com"
              required
            />
          </label>

          <label>
            Phone Number
            <input name="phone" value={formData.phone} onChange={onChange} placeholder="+1 555 123 4567" required />
          </label>
        </div>

        <div className="field-group">
          <h3>Order Details</h3>
          <label>
            Item ID
            <select name="itemId" value={formData.itemId} onChange={onChange}>
              <option value="ITEM-001">ITEM-001 (500 in stock)</option>
              <option value="ITEM-002">ITEM-002 (500 in stock)</option>
              <option value="ITEM-003">ITEM-003 (500 in stock)</option>
              <option value="ITEM-999">ITEM-999 (Out of Stock)</option>
            </select>
          </label>

          <label>
            Quantity
            <input name="quantity" type="number" min="1" value={formData.quantity} onChange={onChange} required />
          </label>

          <label>
            Order Amount ($)
            <input name="amount" type="number" min="1" value={formData.amount} onChange={onChange} placeholder="100" required />
          </label>
        </div>

        <div className="field-group full-width">
          <h3>Payment & Delivery</h3>
          <label>
            Card Number
            <input name="cardNumber" value={formData.cardNumber} onChange={onChange} placeholder="4111 1111 1111 1111" required />
          </label>

          <label className="full-width">
            Delivery Address
            <textarea
              name="deliveryAddress"
              value={formData.deliveryAddress}
              onChange={onChange}
              rows={3}
              placeholder="123 Market Street, Springfield, USA"
              required
            />
          </label>
        </div>

        <div className="full-width form-actions">
          <button type="submit" className="action-btn" disabled={submitting}>
            {submitting ? 'Starting workflow…' : 'Start order workflow'}
          </button>
          <span className="field-note">Presets will auto-fill edge scenarios for the presentation.</span>
        </div>
      </form>
    </div>
  );
}
