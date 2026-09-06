### 1.6.1 单目相机使用

单目相机品牌型号众多，大家可自行采购，在ROS2中，单目相机的使用流程大致如下:

1. 硬件准备；
2. 软件安装；
3. 功能包简介；
4. 功能包使用。

#### 1.硬件准备 {#1硬件准备}

首先将USB相机连接你的计算机（如果连接的是虚拟机，请注意相关设置）。

#### 2.软件准备 {#2软件准备}

安装USB摄像头相关功能包，调用指令如下：

```
sudo apt install ros-${ROS_DISTRO}-usb-cam
```

想要了解源码，也可以继续从 github 直接下载源码到工作空间的src目录：

```
git clone https://github.com/ros-drivers/usb_cam.git -b ros2
```

然后自行构建。

#### 3.功能包简介 {#3测试}

在usb\_cam功能包中包含一个名为`usb_cam_node_exe`的可执行文件和一个名为`camera.launch.py`的launch文件，调用者可以通过二者启动相机驱动。

##### （1）.启动相机节点

**方式1：**启动相机节点，可以直接调用如下指令。

```
ros2 run usb_cam usb_cam_node_exe
```

或可以指定参数（通过参数文件可以设置相机的一些属性信息）：

```
ros2 run usb_cam usb_cam_node_exe --ros-args --params-file 参数文件路径
```

比如：

    ros2 run usb_cam usb_cam_node_exe --ros-args --params-file /path/to/colcon_ws/src/usb_cam/config/params.yaml
    或
    ros2 run usb_cam usb_cam_node_exe --ros-args --params-file `ros2 pkg prefix --share usb_cam`/config/params.yaml

**方式2：**调用launch文件启动相机节点。

```
ros2 launch usb_cam camera.launch.py
```

##### （2）.显示数据

启动`rviz2`，添加`image`插件，并将话题设置为：`/image_raw`，如下图所示：![](/assets/1.5.1_单目相机rviz2.PNG)

#### 4.功能包使用

为了方便使用，我们还可以自行创建功能包。具体实现如下：

##### （1）.新建功能包

调用如下指令，新建功能包：

```
ros2 pkg create mycar_cam --build-type ament_cmake --dependencies usb_cam
```

在功能包下新建launch与params目录，并修改功能包下的CMakeLists.txt文件，添加如下代码：

```
install(DIRECTORY params launch DESTINATION share/${PROJECT_NAME})
```

##### （2）.编写launch文件

在launch目录下新建名为usb\_cam.launch.py的launch文件，并输入如下内容：

```py
import argparse
import os
from pathlib import Path  # noqa: E402
import sys

# Hack to get relative import of .camera_config file working
dir_path = os.path.dirname(os.path.realpath(__file__))
sys.path.append(dir_path)

from camera_config import CameraConfig, USB_CAM_DIR  # noqa: E402

from launch import LaunchDescription  # noqa: E402
from launch.actions import GroupAction  # noqa: E402
from launch_ros.actions import Node  # noqa: E402


CAMERAS = []
CAMERAS.append(
    CameraConfig(
        name='camera1',
        param_path=Path(USB_CAM_DIR, 'params', 'params_1.yaml'),
    )
    # Add more Camera's here and they will automatically be launched below
)


def generate_launch_description():
    ld = LaunchDescription()

    parser = argparse.ArgumentParser(description='usb_cam demo')
    parser.add_argument('-n', '--node-name', dest='node_name', type=str,
                        help='name for device', default='usb_cam')

    camera_nodes = [
        Node(
            package='usb_cam', executable='usb_cam_node_exe', output='screen',
            name=camera.name,
            namespace=camera.namespace,
            parameters=[camera.param_path],
            remappings=camera.remappings
        )
        for camera in CAMERAS
    ]

    camera_group = GroupAction(camera_nodes)

    ld.add_action(camera_group)
    return ld
```

另外在launch目录下还需新建名为camera\_config.py的文件，并输入如下内容：

```py
from pathlib import Path
from typing import List, Optional

from ament_index_python.packages import get_package_share_directory
from pydantic import BaseModel, root_validator, validator

USB_CAM_DIR = get_package_share_directory('mycar_cam')


class CameraConfig(BaseModel):
    name: str = 'camera1'
    param_path: Path = Path(USB_CAM_DIR, 'params', 'params_1.yaml')
    remappings: Optional[List] = None
    namespace: Optional[str] = None

    @validator('param_path')
    def validate_param_path(cls, value):
        if value and not value.exists():
            raise FileNotFoundError(f'Could not find parameter file: {value}')
        return value

    @root_validator(skip_on_failure=True)
    def validate_root(cls, values):
        name = values.get('name')
        remappings = values.get('remappings')
        if name and not remappings:
            # Automatically set remappings if name is set
            remappings = [
                ('image_raw', f'{name}/image_raw'),
                ('image_raw/compressed', f'{name}/image_compressed'),
                ('image_raw/compressedDepth', f'{name}/compressedDepth'),
                ('image_raw/theora', f'{name}/image_raw/theora'),
                ('camera_info', f'{name}/camera_info'),
            ]
        values['remappings'] = remappings
        return values
```

##### （3）.编写配置文件

在params目录下新建两个文件，分别名为：params\_1.yaml和camera\_info.yaml，在params\_1.yaml中输入如下内容：

```yaml
/**:
    ros__parameters:
      video_device: "/dev/video0"
      framerate: 30.0
      io_method: "mmap"
      frame_id: "camera"
      # pixel_format: "mjpeg2rgb"  # see usb_cam/supported_formats for list of supported formats
      pixel_format: "yuyv"  # see usb_cam/supported_formats for list of supported formats
      image_width: 640
      image_height: 480
      camera_name: "test_camera"
      camera_info_url: "package://mycar_cam/params/camera_info.yaml"
      brightness: -1
      contrast: -1
      saturation: -1
      sharpness: -1
      gain: -1
      auto_white_balance: true
      white_balance: 4000
      autoexposure: true
      exposure: 100
      autofocus: false
      focus: -1
```

在camera\_info.yaml中输入如下内容：

```yaml
image_width: 640
image_height: 480
camera_name: test_camera
camera_matrix:
  rows: 3
  cols: 3
  data: [438.783367, 0.000000, 305.593336, 0.000000, 437.302876, 243.738352, 0.000000, 0.000000, 1.000000]
distortion_model: plumb_bob
distortion_coefficients:
  rows: 1
  cols: 5
  data: [-0.361976, 0.110510, 0.001014, 0.000505, 0.000000]
rectification_matrix:
  rows: 3
  cols: 3
  data: [0.999978, 0.002789, -0.006046, -0.002816, 0.999986, -0.004401, 0.006034, 0.004417, 0.999972]
projection_matrix:
  rows: 3
  cols: 4
  data: [393.653800, 0.000000, 322.797939, 0.000000, 0.000000, 393.653800, 241.090902, 0.000000, 0.000000, 0.000000, 1.000000, 0.000000]
```

**小提示：**

_在配置文件中包含了相机标定的部分信息，但是这部分内容在后面章节才有涉及，部分内容是直接复用了usb\_cam中的内容。_

##### （4）.构建并执行

功能包构建后，执行launch文件即可，执行完毕即可在rviz2中查看图像信息。

#### 



