import { useEffect, useState } from "react";
import GalleryCard from "./GalleryCard";
import BreadCrumbComp from "./BreadCrumbComp";
import { ref, onValue } from "firebase/database";
import { db } from './firebase';



export default function Gallery() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
  
    const productsRef = ref(db, 'Gallery');
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

  if (products.length === 0) return <p>Loading gallery...</p>;

  const currentPage = { name: "Gallery", href: "/Gallery" };


  return (
    <>
      <head><title>Gallery | Nolan's Knives</title><meta name="description" content="View Previous Works. Nolan's Gallery. Hand-crafted forged custom knives. Made in Huntsville, Alabama." /></head>
      <br />
      <BreadCrumbComp currentPage={currentPage} />
      <div className="gallery-grid">
        {products.map((p, i) => (
          <GalleryCard key={i} product={p} />
        ))}
      </div>
    </>
  );
}
