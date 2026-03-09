import { createContext, useContext, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);

  const addItem = (product, quantity = 1, variant = null) => {
    const key = `${product.id}-${variant?.id || 'base'}`;
    setItems(prev => {
      const existing = prev.find(i => i.key === key);
      if (existing) {
        return prev.map(i => i.key === key ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [...prev, {
        key,
        product_id: product.id,
        name: product.name,
        price: product.price + (variant?.price_modifier || 0),
        variant_name: variant?.name || '',
        price_modifier: variant?.price_modifier || 0,
        note_required: Number(product.note_required || 0) === 1 ? 1 : 0,
        notes: '',
        quantity,
        image: product.image,
      }];
    });
  };

  const removeItem = (key) => setItems(prev => prev.filter(i => i.key !== key));

  const updateQuantity = (key, quantity) => {
    if (quantity <= 0) return removeItem(key);
    setItems(prev => prev.map(i => i.key === key ? { ...i, quantity } : i));
  };
  const updateItemNotes = (key, notes) => {
    setItems(prev => prev.map(i => (i.key === key ? { ...i, notes: String(notes || '') } : i)));
  };

  const clearCart = () => setItems([]);

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const count = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, updateItemNotes, clearCart, total, count }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
