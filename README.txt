FREE ROAM CAR PLAYGROUND — VERSION 0.11

WHAT'S NEW
- Imported toy vehicles now have separately animated wheels.
- Front wheels steer with A/D and the arrow keys.
- Wheel rotation follows signed forward/reverse speed.
- The semi tractor has six animated wheels; its trailer has four independently animated wheels.
- The pickup, compact car and traffic cars all animate their wheels.

Do not open index.html directly using file://. The game loads its binary vehicle meshes from the assets folder, and browsers restrict fetch() from file URLs.

ASSET LICENSE
Compact Car, Pickup Truck, Semi Truck and trailer geometry are adapted from the Grab3D Cozy Vehicles collection, dedicated under CC0 1.0.
CC0 legal text: https://creativecommons.org/publicdomain/zero/1.0/
Publisher: https://grab3d.com/kits/cozy-vehicles/
\nVersion 0.9 changes:\n- World expanded to a 4x4 layout of the original play area.\n- Connected avenue grid and perimeter traffic circuit.\n- Twelve persistent traffic vehicles follow the city loop and can be knocked off line.\n- Added varied low-rise, mid-rise and tower buildings across the expanded districts.\n

Version 0.11 changes:
- Replaced the rolling terrain with a single flat green baseplate.
- Rebuilt streets from reusable box-based road, intersection, sidewalk and corner modules.
- Street layout is data-driven; each placed pavement module registers its matching ground-support collider.
- Road runs use discrete chunks and dedicated intersection boxes to avoid overlapping top surfaces.
