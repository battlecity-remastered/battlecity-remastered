const url=new URL(window.location.href);
const boot=url.searchParams.get("demo")==="1"
    ? import("./three-demo.js").then(module=>module.startThreeDemo())
    : import("./three-game.js").then(module=>module.startThreeGame());

void boot.catch(error=>{
    console.error("[boot.fail]",error);
    const panel=document.createElement("pre");panel.dataset.ui="three-demo-hud";
    panel.textContent=error instanceof Error?error.message:String(error);
    Object.assign(panel.style,{position:"absolute",inset:"16px auto auto 16px",zIndex:"100",padding:"16px",color:"#ffdede",background:"#381515"});
    document.getElementById("app")?.append(panel);
});
