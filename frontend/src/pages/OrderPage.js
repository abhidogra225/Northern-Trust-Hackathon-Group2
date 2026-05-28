import { useState } from "react";
import "../index.css";

function OrderPage() {
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");

  const placeOrder = async () => {
    const res = await fetch("http://localhost:5000/api/order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ productId, quantity })
    });

    const data = await res.json();
    alert(data.message);
  };

  return (
    <div className="form-box">
      <h2>Place Order</h2>

      <input
        placeholder="Product ID"
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
      />

      <input
        placeholder="Quantity"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
      />

      <button onClick={placeOrder}>Place Order</button>
    </div>
  );
}

export default OrderPage;