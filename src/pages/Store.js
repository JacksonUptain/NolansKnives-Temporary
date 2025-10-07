import BreadCrumbComp from "./BreadCrumbComp";
import NolanStore from "./NolanStore";
import "./breadcrumb.css"
export default function Store() {
  var currentPage = {name: "Store", href: "/Store"}
  return(
    <>
    
      <h1>Store Page</h1>
      <BreadCrumbComp currentPage={currentPage} />
      <NolanStore></NolanStore>
    
    </>
  
  ) 
}
