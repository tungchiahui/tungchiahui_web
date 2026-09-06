### 2.3.3 多相机

同一机器人主体上，可能会安装多个相机，比如现有前后两个相机，那么应该如何同时启动这两个相机呢？

启动多个相机的方式与启动单个相机的大致流程类似，每个相机都需要执行相机启动节点并关联各自的配置文件，但是两个相机节点的节点名称、话题名称、所加载的参数等需要有所区分，比如可以使用命名空间避免节点重名、话题重名的问题，配置文件中设置不同坐标系等，一个具体的示例使用如下：

#### 1.准备工作

请先按照**1.3.2 USB端口绑定**的相关内容为两个相机端口映射别名，比如可以分别为mycamera\_front和mycamera\_back。

#### 2.编写launch文件

在mycar\_cam功能包的launch目录下新建名为usb\_cam2.launch.py的launch文件，并输入如下内容：

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
        name='camera_front',
        param_path=Path(USB_CAM_DIR, 'params', 'params_front.yaml'),
    )
)
CAMERAS.append(
    CameraConfig(
        name='camera_back',
        param_path=Path(USB_CAM_DIR, 'params', 'params_back.yaml'),
    )
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

#### 3.编写配置文件

在params目录下为两个相机分别编写配置文件，前相机对应：params\_front.yaml和camera\_info\_front.yaml；后相机对应：params\_back.yaml和camera\_info\_back.yaml。

在params\_front.yaml中输入如下内容：

```yaml
/**:
    ros__parameters:
      video_device: "/dev/mycamera_front"
      framerate: 30.0
      io_method: "mmap"
      frame_id: "camera_front"
      pixel_format: "mjpeg2rgb"  # see usb_cam/supported_formats for list of supported formats
      image_width: 640
      image_height: 480
      camera_name: "front_camera"
      camera_info_url: "package://mycar_cam/params/camera_info_front.yaml"
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

在camera\_info\_front.yaml中输入相机标定后的参数：

```yaml
image_width: 640
image_height: 480
camera_name: front_camera
camera_matrix:
  rows: 3
  cols: 3
  data: [800.18443,   0.     , 367.16231,
           0.     , 801.99881, 259.97276,
           0.     ,   0.     ,   1.     ]
distortion_model: plumb_bob
distortion_coefficients:
  rows: 1
  cols: 5
  data: [-0.456090, 0.292195, -0.009724, 0.000473, 0.000000]
rectification_matrix:
  rows: 3
  cols: 3
  data: [1., 0., 0.,
         0., 1., 0.,
         0., 0., 1.]
projection_matrix:
  rows: 3
  cols: 4
  data: [734.86957,   0.     , 374.26753,   0.     ,
           0.     , 767.03955, 258.69865,   0.     ,
           0.     ,   0.     ,   1.     ,   0.     ]
```

在params\_back.yaml中输入如下内容：

```yaml
/**:
    ros__parameters:
      video_device: "/dev/mycamera_back"
      framerate: 30.0
      io_method: "mmap"
      frame_id: "camera_back"
      pixel_format: "mjpeg2rgb"  # see usb_cam/supported_formats for list of supported formats
      image_width: 640
      image_height: 480
      camera_name: "back_camera"
      camera_info_url: "package://mycar_cam/params/camera_info_back.yaml"
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

在camera\_info\_back.yaml中输入相机标定后的参数：

```yaml
image_width: 640
image_height: 480
camera_name: back_camera
camera_matrix:
  rows: 3
  cols: 3
  data: [800.18443,   0.     , 367.16231,
           0.     , 801.99881, 259.97276,
           0.     ,   0.     ,   1.     ]
distortion_model: plumb_bob
distortion_coefficients:
  rows: 1
  cols: 5
  data: [-0.456090, 0.292195, -0.009724, 0.000473, 0.000000]
rectification_matrix:
  rows: 3
  cols: 3
  data: [1., 0., 0.,
         0., 1., 0.,
         0., 0., 1.]
projection_matrix:
  rows: 3
  cols: 4
  data: [734.86957,   0.     , 374.26753,   0.     ,
           0.     , 767.03955, 258.69865,   0.     ,
           0.     ,   0.     ,   1.     ,   0.     ]
```

#### 4.构建并执行

功能包构建后，执行launch文件，启动`rviz2`，添加`image`插件，并将话题分别设置为：

`/camera_front/image_raw`和`/camera_back/image_raw`，即可分别显示前后相机的图像数据。

