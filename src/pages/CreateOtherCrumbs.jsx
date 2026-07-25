import Breadcrumb from 'react-bootstrap/Breadcrumb';
import { Link } from "react-router-dom";

let allPages = [
  { name: "Home", href: "/" },
  { name: "Gallery", href: "/gallery" },
  { name: "Store", href: "/store" }
];

function CreateOtherCrumbs({ currentPage }) {
  return (
    <>
      {allPages.map((page) => (
        <Breadcrumb.Item
          key={page.name}
          as={Link}
          to={page.href}
          active={currentPage.name !== page.name}
        >
          {page.name}
        </Breadcrumb.Item>
        
      ))}
    </>
  );
}

export default CreateOtherCrumbs;
