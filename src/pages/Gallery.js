import BreadCrumbComp from "./BreadCrumbComp";

export default function Gallery() {
  var currentPage = {name: "Gallery", href: "/Gallery"}
  return(
    <>
    
      <h1>Gallery Page</h1>
      <BreadCrumbComp currentPage={currentPage} />

    
    </>
  
  ) 
}