import React, { useState, useRef, useEffect } from 'react';
import './Product.css'
import ProductCarousel from './productCarousel';

function Product({ product }) {
  const [paidFor, setPaidFor] = useState(false);
  const [error, setError] = useState(null);
  const paypalRef = useRef();

 useEffect(() => {
  if (!paypalRef.current || !window.paypal) return;

  // Clear old PayPal buttons
  paypalRef.current.innerHTML = "";

  // Create the PayPal button instance
  const button = window.paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay' },
    createOrder: (data, actions) => {
      return actions.order.create({
        purchase_units: [
          {
            description: product.description,
            custom_id: product.custom_id,
            amount: { currency_code: 'USD', value: product.price }
          }
        ]
      });
    },
    onApprove: async (data, actions) => {
      const order = await actions.order.capture();
      setPaidFor(true);
      console.log(order);
    },
    onError: (err) => {
      setError(err);
      console.error(err);
    }
  });

  // Render the button
  button.render(paypalRef.current);

  // ✅ Cleanup: close button when component unmounts or product changes
  return () => {
    try {
      button.close();
    } catch (e) {
      // Ignore “container removed” if already detached
    }
  };
}, [product]);


  

  if (paidFor) {
    return (
    <div className="product-card">
        {error && (
        <div className="error-message">Uh oh, an error occurred! {error.message}</div>
        )}

        <div className="product-info">
        <h2 className="product-title">Congrats! You just bought "{product.name}"</h2>
        <p className="product-description">{product.description}</p>
        <span className="price-badge">Sold - ${product.price} USD</span>
        </div>

        <ProductCarousel items={product.src}/>
       
    </div>
    );
  }

if(product.sold) {
  return (
    <div className="product-card">
        {error && (
        <div className="error-message">Uh oh, an error occurred! {error.message}</div>
        )}

        <div className="product-info">
        <h2 className="product-title">{product.name}</h2>
        <p className="product-description">{product.description}</p>
        <span className="price-badge">Sold - ${product.price} USD</span>
        </div>

        <ProductCarousel items={product.src}/>
       
    </div>
    );
}
 
if(product.src.length <= 1) {
  
    return (
    <div className="product-card">
        {error && (
        <div className="error-message">Uh oh, an error occurred! {error.message}</div>
        )}

        <div className="product-info">
        <h2 className="product-title">{product.name}</h2>
        <p className="product-description">{product.description}</p>
        <span className="price-badge">${product.price} USD</span>
        </div>

        <img alt={product.description} src={`https://raw.githubusercontent.com/JacksonUptain/nolans-knives-image-database/refs/heads/main/images/${product.src}`} />
        <div className="paypal-button-container" ref={paypalRef}></div>
    </div>
    );
} else if (product.src.length >= 2 ){
        
     return (
    <div className="product-card">
        {error && (
        <div className="error-message">Uh oh, an error occurred! {error.message}</div>
        )}

        <div className="product-info">
        <h2 className="product-title">{product.name}</h2>
        <p className="product-description">{product.description}</p>
        <span className="price-badge">${product.price} USD</span>
        </div>

        <ProductCarousel items={product.src}/>
        <div className="paypal-button-container" ref={paypalRef}></div>
    </div>
    );
}

}

export default Product;

