import BreadCrumbComp from "./BreadCrumbComp";

export default function Goal() {
  var currentPage = {name: "Goal", href: "/Goal"}
  return(
    <>
    
      <br></br>
      <BreadCrumbComp currentPage={currentPage} />

    
    </>
  
  ) 
}