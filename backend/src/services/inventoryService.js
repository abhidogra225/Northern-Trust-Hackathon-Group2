const reserveInventory = (req, res) => {
    const { orderId, items } = req.body;
    console.log(`[Inventory Service] Checking stock for order ${orderId}...`);

    setTimeout(() => {
        console.log(`[Inventory Service] ✅ Items reserved for order ${orderId}`);
        res.status(200).json({ 
            success: true, 
            status: "INVENTORY_RESERVED" 
        });
    }, 800); // 800ms mock processing delay
};

module.exports = {
    reserveInventory
};