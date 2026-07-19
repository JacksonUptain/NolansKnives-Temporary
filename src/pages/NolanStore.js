import './Product.css';
import Product from './Product.jsx';
import { useEffect, useState } from 'react';
import { ref, onValue } from "firebase/database";
import { db } from './firebase';



function NolanStore() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
  
    const productsRef = ref(db, 'Products');
    const unsubscribe = onValue(productsRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const productArray = Object.entries(data).map(([id, value]) => ({
          id,
          ...value
        }));
        setProducts(productArray);
      } else {
        setProducts([]);
      }
    });

    return () => unsubscribe();
  }, []);

  if (products.length === 0) return <p>Loading products...</p>;

  
  return (
    <div className="store-container">
      <head><title>Store | Nolan's Knives</title><meta name="description" content="Nolan's Store. Custom forged knives crafted with precision and durability. Buy NOW!" /></head>
      <h1 className="store-title">Nolan’s Store</h1>
      <div className="products-grid">
        
        {products.map((product, index) => (
          
          <Product key={product.id} product={product} index={index} expanded={false}/>
        ))}
      </div>
    </div>
  );

}

export default NolanStore;
