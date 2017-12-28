# iobroker.vdr
VDR adapter for ioBroker platform

Overview:
=========
This is an adapter for the ioBroker platform (http://iobroker.net/) to access a VDR - VideoDiskRecorder - (http://www.tvdr.de/). Thanks to Klaus Schmidinger, the author of VDR, for this fantastic project! And also thanks to the yavdr team for the RESTful API plugin.

Pre-requisites:
==============
* A VDR installation obviously.
* The RESTful API VDR-plugin (https://github.com/yavdr/vdr-plugin-restfulapi) to communicate with VDR.

Description:
============
At the moment the adapter only supports sending remote control commands as key inputs. A state KeyPress is created that can be used to send key events. The name of keys follows the specification as in API.html of the RESTful API plugin (see github link above).
