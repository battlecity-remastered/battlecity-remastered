from pathlib import Path
source = Path(__file__).with_name("build_demo_assets.py")
exec(compile(source.read_text().split("\nbuild_tank()\n")[0], str(source), "exec"), globals())
clear()
root=bpy.data.objects.new("BattleCityResidentialHabitat",None)
bpy.context.collection.objects.link(root)
warm=material("Habitat warm window glow",(.20,.095,.028),.18,.23,(.36,.16,.045))
warm.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"].default_value=.8
CONCRETE=material("Habitat satin chrome",(.20,.26,.27),.68,.53)
STEEL=material("Habitat brushed steel",(.17,.22,.22),.62,.52)
GLASS=material("Habitat cyan window glow",(.045,.16,.20),.25,.35,(.015,.11,.16))
paint=material("Habitat blue grey armour",(.035,.068,.075),.66,.31)
def block(name,pos,size,mat,bevel=.025):
    obj=cube(name,pos,size,mat,bevel);obj.parent=root;return obj
def tube(name,pos,radius,height,mat):
    obj=cylinder(name,pos,radius,height,mat,32);obj.parent=root;return obj
block("Residential recessed foundation",(0,0,.075),(1.44,1.44,.075),PANELS,.05)
block("Housing chrome ground sill",(0,0,.18),(1.36,1.36,.045),CONCRETE,.035)
for side in (-1,1):
    x=side*.72
    block("DX twin residential wing",(x,0,.85),(.52,1.18,.66),paint,.09)
    # Continuous inset glazing plus structural balconies on both facades.
    for level in range(3):
        z=.45+level*.38
        for end in (-1,1):
            block("Recessed residential window",(x,end*1.185,z),(.425,.012,.105),PANELS,.012)
            for bay in range(4):
                block("Warm apartment glazing",(x-.315+bay*.21,end*1.203,z),(.084,.011,.073),warm if (bay+level+side)%3 else GLASS,.008)
            block("Terraced steel balcony",(x,end*1.235,z-.13),(.49,.105,.027),STEEL,.018)
            block("Balcony chrome lip",(x,end*1.33,z-.075),(.49,.012,.032),CONCRETE,.012)
        for edge in (-1,1):
            block("Side illuminated window ribbon",(x+edge*.524,0,z),(.012,.96,.066),warm,.009)
    for y in (-.98,-.49,0,.49,.98):
        block("Housing cast armour spine",(x+side*.525,y,.93),(.025,.027,.63),CONCRETE,.013)
    # The fixed overhead gameplay camera must see inhabited roofs, not blank slabs.
    block("Curved residential roof shell",(x,0,1.56),(.56,1.21,.085),PANELS,.065)
    for y in (-.90,-.45,0,.45,.90):
        block("Roof recessed skylight bed",(x,y,1.65),(.39,.145,.017),CONCRETE,.018)
        block("Warm glazed skylight",(x,y,1.673),(.335,.112,.008),GLASS,.011)
        block("Skylight chrome mullion",(x,y,1.69),(.016,.125,.008),STEEL,.004)
    for y in (-1.03,-.23,.23,1.03):
        block("Roof transverse chrome brace",(x,y,1.69),(.525,.019,.023),STEEL,.012)
    for edge in (-1,1):
        block("Roof longitudinal titanium rail",(x+edge*.48,0,1.70),(.025,1.14,.032),STEEL,.016)
        block("Roof cyan navigation strip",(x+edge*.46,0,1.724),(.009,1.05,.009),GLASS,.005)
    block("Roof service machinery pod",(x,.68,1.82),(.265,.28,.14),PANELS,.04)
    for rib in range(7):
        block("Habitat radiator cooling fin",(x-.205+rib*.069,.68,1.976),(.016,.245,.014),CONCRETE,.008)
    tube("Rooftop copper heat exchanger",(x,-.65,1.86),.145,.31,MINE_SHELL)
    for height in (1.74,1.87,2.00):
        ring=torus("Heat exchanger chrome collar",(x,-.65,height),.15,.013,CONCRETE);ring.parent=root
# Raised connecting gallery keeps the original two-wing housing silhouette.
block("Habitat central elevated bridge",(0,.10,1.00),(.23,.24,.12),STEEL,.045)
block("Bridge glazed roof",(0,.10,1.14),(.19,.19,.018),GLASS,.012)
block("Residential shared entrance",(0,-.92,.48),(.24,.32,.27),CONCRETE,.045)
block("Housing entry glass",(0,-1.253,.49),(.17,.012,.19),GLASS,.012)
block("Entrance illuminated canopy",(0,-1.19,.82),(.30,.20,.035),STEEL,.025)
block("Warm entry canopy strip",(0,-1.37,.806),(.24,.009,.011),LAMP,.006)
for step in range(3):
    block("Habitat access step",(0,-1.25-step*.07,.19-step*.035),(.29,.09,.019),STEEL,.012)
for y in (-.76,-.36,.38,.83):
    block("Shared courtyard walkway",(0,y,.17),(.13,.16,.018),PANELS,.015)
    for side in (-1,1):
        block("Courtyard guide light",(side*.16,y,.195),(.013,.085,.011),GLASS,.005)
export("battlecity-housing.glb")
