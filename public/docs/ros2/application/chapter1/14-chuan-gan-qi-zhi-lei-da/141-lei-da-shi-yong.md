### 1.5.1 单线激光雷达使用

单线激光雷达的品牌型号琳琅满目，其中思岚A1激光雷达是一款性价比较高的单线激光雷达，本节将以此款为例介绍单线激光雷达的基本使用。

![](/assets/1.4.1_01思岚A1雷达.jpg)

思岚A1激光雷达基本使用流程如下：

1. 硬件准备；
2. 软件安装；
3. 启动并测试；

#### 1.硬件准备 {#1硬件准备}

首先，在物理层面我们需要将激光雷达连接到机器人的控制系统。具体操作如下：

（1）. 将开发套装中提供的信号连接排线分别与思岚A1模组及USB适配器 进行连接。思岚A1模组的对应接口插座位于模组的底部。

![](/assets/1.4.1_思岚A1接线上.PNG)

（2）. 将USB适配器通过Micro-USB线缆与控制系统连接。如果控制系统已经启动，在USB线缆连接后，可以观测到思岚A1 底部的电源指示灯点亮，并且思岚A1开始转动。

![](/assets/1.4.1_思岚A1接线下.PNG)

然后，还需要保证上位机已经按照本教程第1.3.1节内容进行了USB端口设置（如果是使用底盘自带的上位机，那么已经默认进行了配置），上位机可以识别并操作外接的USB设备。

#### 2.软件安装

**注意：**如果是使用底盘自带的上位机，该部分操作都已经默认实现。

进入工作空间的src目录，下载相关雷达驱动包，下载命令如下：

```
git clone https://github.com/Slamtec/sllidar_ros2.git
```

返回工作空间，调用`colcon build`编译即可。

另外，构建成功后，就可以使用雷达驱动包了，但是为了更方便的使用雷达，可以为雷达端口映射一个固定别名，相关的脚本无需自己编写，在下载好的功能包sllidar\_ros2的scripts目录下已经提供了，终端下进入工作空间，执行如下指令：

```
cd src/sllidar_ros2/scripts #进入脚本所属目录
sudo cp rplidar.rules /etc/udev/rules.d
sudo service udev reload
sudo service udev restart
```

操作完毕之后，重新插拔USB设备，雷达的端口，将被映射到固定的别名：`rplidar`，该别名也可以通过修改rplidar.rules自行配置。执行完毕，可以通过如下指令查看映射结果：

```
ll /dev | grep ttyUSB
```

将输入如下结果：

![](/assets/1.4.1_02USB端口设置固定名称.PNG)

#### 3.启动并测试

##### （1）准备launch文件

在功能包的launch目录下，已经内置了不同类型的launch文件，在此我们使用sllidar\_launch.py，该文件内容如下：

```py
#!/usr/bin/env python3

import os

from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import DeclareLaunchArgument
from launch.actions import LogInfo
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node


def generate_launch_description():
    serial_port = LaunchConfiguration('serial_port', default='/dev/ttyUSB0')
    serial_baudrate = LaunchConfiguration('serial_baudrate', default='115200') #for A1/A2 is 115200
    frame_id = LaunchConfiguration('frame_id', default='laser')
    inverted = LaunchConfiguration('inverted', default='false')
    angle_compensate = LaunchConfiguration('angle_compensate', default='true')

    return LaunchDescription([

        DeclareLaunchArgument(
            'serial_port',
            default_value=serial_port,
            description='Specifying usb port to connected lidar'),

        DeclareLaunchArgument(
            'serial_baudrate',
            default_value=serial_baudrate,
            description='Specifying usb port baudrate to connected lidar'),

        DeclareLaunchArgument(
            'frame_id',
            default_value=frame_id,
            description='Specifying frame_id of lidar'),

        DeclareLaunchArgument(
            'inverted',
            default_value=inverted,
            description='Specifying whether or not to invert scan data'),

        DeclareLaunchArgument(
            'angle_compensate',
            default_value=angle_compensate,
            description='Specifying whether or not to enable angle_compensate of scan data'),


        Node(
            package='sllidar_ros2',
            node_executable='sllidar_node',
            node_name='sllidar_node',
            parameters=[{'serial_port': serial_port, 
                         'serial_baudrate': serial_baudrate, 
                         'frame_id': frame_id,
                         'inverted': inverted, 
                         'angle_compensate': angle_compensate}],
            output='screen'),
    ])
```

由于我们已经为雷达映射了固定别名，所以可以将代码：

```py
serial_port = LaunchConfiguration('serial_port', default='/dev/ttyUSB0')
```

修改为：

```py
serial_port = LaunchConfiguration('serial_port', default='/dev/rplidar')
```

除此之外，参数frame\_id也是一个较为重要的参数，大家需要根据具体需要动态修改，在此我们使用默认值即可。

##### （2）执行launch文件

终端工作空间下输入命令:

```
ros2 launch sllidar_ros2 sllidar_launch.py
```

执行成功后，将启动雷达驱动。

##### （3）查看结果

启动 rviz2，将FixedFrame设置为laser，添加LaserScan插件，并将插件的topic设置为/scan。在rviz2中将显示雷达扫描到的障碍物数据。

#### ![](/assets/1.4.1_03雷达扫描.PNG)



