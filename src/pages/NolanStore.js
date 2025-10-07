import './Product.css';
import Product from './Product.jsx';
import { useEffect, useState } from 'react';
import { getDatabase, ref, onValue } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAr341b5_CQxZHQg3ZEZDTaMYVYh14v8i8",
  authDomain: "nolansknives.firebaseapp.com",
  databaseURL: "https://nolansknives-default-rtdb.firebaseio.com",
  projectId: "nolansknives",
  storageBucket: "nolansknives.firebasestorage.app",
  messagingSenderId: "233692313709",
  appId: "1:233692313709:web:3e37d30d821cfed718e764",
  measurementId: "G-0G3HMYE8QC"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

function NolanStore() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    const productsRef = ref(db, 'products');
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
      <h1 className="store-title">Nolan’s Knives</h1>
      <div className="products-grid">
        {products.map((product, index) => (
          <Product key={product.id} product={product} index={index} />
        ))}
      </div>
    </div>
  );

}

export default NolanStore;
