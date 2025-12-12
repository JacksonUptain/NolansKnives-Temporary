import { useEffect, useState } from "react";
import GalleryCard from "./GalleryCard";
import BreadCrumbComp from "./BreadCrumbComp";

export default function Gallery() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    fetch("https://raw.githubusercontent.com/nolansknives/gallery-database/refs/heads/main/nolansgallery.json")
      .then(response => response.json())
      .then(data => {
        console.log("Parsed JSON:", data);
        setProducts(data); // <-- update state
      })
      .catch(error => {
        console.error("Error loading JSON:", error);
      });
  }, []); // empty array so this runs once on load

  const currentPage = { name: "Gallery", href: "/Gallery" };

  return (
    <>
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
