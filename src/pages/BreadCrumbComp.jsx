import Breadcrumb from 'react-bootstrap/Breadcrumb';
import CreateOtherCrumbs from './CreateOtherCrumbs';





function BreadCrumbComp({currentPage}) {
  return (
    <Breadcrumb>
      <CreateOtherCrumbs currentPage={currentPage}/>
     
    </Breadcrumb>
  );
}




export default BreadCrumbComp;