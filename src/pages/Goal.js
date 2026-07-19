
import BreadCrumbComp from "./BreadCrumbComp";
import "./Goal.css"
export default function Goal() {
  var currentPage = {name: "Goal", href: "/Goal"}
  return(
    <>
      
      <head><title>Goal | Nolan's Knives</title><meta name="description" content="Nolan's Goal. Nolan's goal is to deliver custom forged knives with superior precision and durablity." /></head>
      <br></br>
      <BreadCrumbComp currentPage={currentPage} />
      <p class="text">Sorry<br></br>Work in progress</p>
      <div class="container">
        <div class="bg"></div>
        <div class="arm-left"></div>
        <div class="blacksmith">
          <div class="shape">
            <div class="dress"></div>
            <div class="dress"></div>
          </div>
          <div class="head">  
            <div class="moustache"></div>
            <div class="moustache"></div>
            <div class="eye"></div>    
          </div>
          <div class="arm-right">
            <div class="hammer"></div>
          </div>
        </div>
        <div class="sword">
          <div class="handle"></div>
        </div>
        <div class="anvil"></div>
        <div class="fire-box">
          <div class="fire"></div>
          <div class="fire"></div>
          <div class="fire"></div>
          <div class="fire"></div>
        </div>
      </div>

      <a href="https://codepen.io/SofiaSergio/" target="_blank" rel="noopener noreferrer" className="credit">Credit: Sofia Sergio</a>
    
    </>
  
  ) 
}