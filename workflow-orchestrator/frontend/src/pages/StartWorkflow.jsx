import { useState } from 'react';
import { startWorkflow } from '../services/api';

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successData, setSuccessData] = useState(null);

  function onChange(event) {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
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
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Start New Order Workflow</h2>
          <p className="page-subtitle">Enter customer and order details to launch the workflow.</p>
        </div>
      </div>

      {error ? <div className="banner error">{error}</div> : null}

      {successData ? (
        <div className="banner success">
          <strong>Workflow created successfully.</strong>
          <div className="small-note">
            Instance ID: <span className="mono">{successData.workflowInstanceId}</span>
          </div>
          <button type="button" className="link-inline" onClick={() => onOpenWorkflow(successData.workflowInstanceId)}>
            View workflow details
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
            Email
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
            Phone
            <input name="phone" value={formData.phone} onChange={onChange} placeholder="+1 555 123 4567" required />
          </label>
        </div>

        <div className="field-group">
          <h3>Order Details</h3>
          <label>
            Item
            <select name="itemId" value={formData.itemId} onChange={onChange}>
              <option value="ITEM-001">ITEM-001</option>
              <option value="ITEM-002">ITEM-002</option>
              <option value="ITEM-003">ITEM-003</option>
            </select>
          </label>

          <label>
            Quantity
            <input name="quantity" type="number" min="1" value={formData.quantity} onChange={onChange} required />
          </label>

          <label>
            Order Amount
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
          <span className="field-note">Use card ending in 0000 to simulate payment failure.</span>
        </div>
      </form>
    </div>
  );
}
