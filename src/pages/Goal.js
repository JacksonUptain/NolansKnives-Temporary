import BreadCrumbComp from "./BreadCrumbComp";

export default function Goal() {
  var currentPage = {name: "Goal", href: "/Goal"}
  return(
    <>
    
      <h1>Goal Page</h1>
      <BreadCrumbComp currentPage={currentPage} />

    
    </>
  
  ) 
}