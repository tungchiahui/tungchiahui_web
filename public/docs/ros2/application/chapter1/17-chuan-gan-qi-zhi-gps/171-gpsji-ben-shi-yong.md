### 1.8.1 GNSS基本使用

同其他传感器一样，GNSS品牌型号众多，大家可自行采购，本教程我们采用轮趣的GPS北斗双模定位模块。

![](/assets/1.8.1_GNSS.jpg)

GNSS使用流程大致如下：

1. 硬件准备；
2. 软件安装；
3. 启动并测试。

需要注意的是，实验时最好在室外空旷区域下进行，以保证GNSS接受信号正常，并能发布准确的定位信息。

#### 1.硬件准备 {#1硬件准备}

将GNSS连接到你的计算机（如果连接的是虚拟机，请注意相关设置）。

#### 2.软件安装

##### （1）.安装serial

ros1中可以直接用apt安装，但是目前ros2还不支持，只能手动下载源码编译安装，相关指令如下：

```
git clone https://github.com/ZhaoXiangBox/serial
cd serial
mkdir build
cd build
cmake ..
make
sudo make install
```

##### （2）.驱动准备

复制fdilink\_ahrs\_ROS2功能包放到工作空间的src目录下，并执行绑定串口文件：

```
sudo chmod 777 wheeltec_udev.sh
sudo sh wheeltec_udev.sh
```

重新插拔GNSS设备。

#### 3.启动并测试

终端下进入工作空间，并调用如下指令构建功能包：

```
colcon build --packages-select fdilink_ahrs
```

构建成功后，继续在终端下输入如下指令以启动GNSS驱动。

```
source install/setup.bash
ros2 launch fdilink_ahrs ahrs_driver.launch.py
```

GNSS消息无法直接在rviz2中可视化显示，我们可以通过`ros2 topic list`查看驱动所发布的话题，其中有一个名为`/gps/fix`

的话题，便对应的是GNSS消息，我们可以指令`ros2 topic echo /gps/fix`将消息输出在终端，结果如下：

```
---
header:
  stamp:
    sec: 1697619593
    nanosec: 118176464
  frame_id: navsat_link
status:
  status: 0
  service: 0
latitude: 0.0
longitude: 0.0
altitude: -5251.490234375
position_covariance:
- 0.0
- 0.0
- 0.0
- 0.0
- 0.0
- 0.0
- 0.0
- 0.0
- 0.0
position_covariance_type: 0
---
```

需要注意的是，在上述消息中，由于GNSS是在室内使用的，由于信号被遮挡，消息中的经纬度、海拔高度等数据并不准确。

