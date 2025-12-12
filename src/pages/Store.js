import BreadCrumbComp from "./BreadCrumbComp";
import NolanStore from "./NolanStore";
import "./breadcrumb.css"
export default function Store() {
  var currentPage = {name: "Store", href: "/Store"}
  return(
    <>
      <br></br>
      <BreadCrumbComp currentPage={currentPage} />
      <NolanStore></NolanStore>
    
    </>
  
  ) 
}
