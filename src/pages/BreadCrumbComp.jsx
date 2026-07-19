import Breadcrumb from 'react-bootstrap/Breadcrumb';
import CreateOtherCrumbs from './CreateOtherCrumbs';





function BreadCrumbComp({currentPage}) {
  return (
    <>
    <h1 style={{display: 'none'}}>{currentPage.name} | Nolan's Knives</h1>
    <Breadcrumb>
      <CreateOtherCrumbs currentPage={currentPage}/>
     
    </Breadcrumb>
    </>
  );
}




export default BreadCrumbComp;