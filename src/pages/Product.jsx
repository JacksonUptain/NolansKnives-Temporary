import React, { useState, useRef, useEffect } from 'react';
import './Gallery.css';
import ProductCarousel from './productCarousel';
import OffScreen from './offScreen';

function Product({ product, expanded }) {
  const [paidFor, setPaidFor] = useState(false);
  const [error, setError] = useState(null);
  const [showExpanded, setShowExpanded] = useState(false);
  const paypalRef = useRef();
  var productDescription;
  if (expanded === "Y") {
    productDescription = product.description;
  } else {
    productDescription = product.description.substring(0, 150) + "...";
  }

  useEffect(() => {
    if (!paypalRef.current || !window.paypal) return;

    paypalRef.current.innerHTML = "";

    const button = window.paypal.Buttons({
      style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 30},
      createOrder: (data, actions) => {
        return actions.order.create({
          purchase_units: [
            {
              description: `${product.name}: ${productDescription}`,
              custom_id: product.custom_id,
              amount: { currency_code: 'USD', value: product.price },
            },
          ],
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
      },
    });
    
    
    
    button.render(paypalRef.current);
    
    return () => {
      try {
        button.close();
      } catch {}
    };
  }, [product]);
  
  // ---- Helper to render shared content ----
  const renderContent = () => (
    
    <div className="product-card" onClick={() => {if(expanded !== "Y") setShowExpanded(true)}}>
      {error && <div className="error-message">Uh oh, an error occurred! {error.message}</div>}
      
      <div className="product-info">
        <h2 className="product-title">{product.name}</h2>
        <p className="product-description">{productDescription}</p>
        <span className="price-badge">
          {product.sold ? `Sold - $${product.price} USD` : `$${product.price} USD`}
        </span>
      </div>

      {product.src.length <= 1 ? (
        <img
        
          alt={productDescription}
          src={product.src[0]}
          id="productImage"
        />
      ) : (
        <div onClick={() => {if(expanded !== "Y") setShowExpanded(true)}}><ProductCarousel items={product.src}  /></div>
        
      )}

      {!product.sold && <div className="paypal-button-container" ref={paypalRef} style={{width: "100vw !important"}}></div>}
    </div>
  );

  // ---- Paid version ----
  if (paidFor) {
    return (
      <div className="product-card">
        <h2>Congrats! You just bought "{product.name}"</h2>
        <p>{productDescription}</p>
        <span className="price-badge">Sold - ${product.price} USD</span>
        <ProductCarousel items={product.src} />
      </div>
    );
  }

  // ---- Expanded fullscreen via OffScreen ----
  if ( showExpanded ) {
    
    return (
      <OffScreen buttonText="" product={product} onHide={() => setShowExpanded(false)}>
        {renderContent()}
      </OffScreen>
    );
  }

  // ---- Default product ----
  return renderContent();
}

export default Product;
