'use client';

import { useState, useEffect } from 'react';
import Product from './Product';
import Offcanvas from 'react-bootstrap/Offcanvas';
import './offScreen.css';

function OffScreen({ product, onHide }) {
  const [show, setShow] = useState(true);

  const handleClose = () => {
    setShow(false);
    if (onHide) onHide();
    window.location.reload();
  };

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  return (
    <Offcanvas
      show={show}
      onHide={handleClose}
      placement="start"
      backdrop={false}
      scroll={false}
      className="offscreen-full"
      style={{ transform: 'translateX(0)' }} // force full visible area
    >
      <Offcanvas.Header closeButton >
        <Offcanvas.Title>Nolan's Store</Offcanvas.Title>
      </Offcanvas.Header>
      <Offcanvas.Body><Product product={product} expanded={"Y"}/></Offcanvas.Body>
    </Offcanvas>
  );
}

export default OffScreen;
