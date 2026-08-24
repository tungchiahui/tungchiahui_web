### 1.5.6 多线激光雷达基本使用

同单线激光雷达一样，多线激光雷达的品牌型号同样琳琅满目，本节将以RoboSense速腾聚创的RS-LiDAR-32为例介绍多线激光雷达的基本使用。

![](/assets/1.4.1_RoboSense32线雷达.jpg)

RS-LiDAR-32是一款32线激光雷达，其基本使用流程如下：

1. 软件安装与配置；
2. 硬件准备与配置；
3. 启动并测试。

#### 1.软件安装与配置

（1）、进入工作空间的src目录，下载相关雷达驱动包，下载命令如下：

```
git clone https://github.com/RoboSense-LiDAR/rslidar_sdk.git
git clone https://github.com/RoboSense-LiDAR/rslidar_msg.git
```

进入rslidar\_sdk并执行初始化与更新：

```
cd rslidar_sdk
git submodule init
git submodule update
```

（2）、安装Yaml

要求Yaml版本号至少是v0.5.2，如果安装的是ROS2的_desktop-full_，则可以跳过此步骤，否则自行安装，安装命令如下：

```
sudo apt-get update
sudo apt-get install -y libyaml-cpp-dev
```

（3）、安装libpcap

要求libpcap版本号至少是 v1.7.4，安装命令如下：

```
sudo apt-get install -y  libpcap-dev
```

（4）、修改配置文件

打开工程内的_CMakeLists.txt_文件，将文件顶部的变量**COMPILE\_METHOD**改为**COLCON**。

```
#
=======================================
#
 Compile setup (ORIGINAL,CATKIN,COLCON)
#
=======================================
set
(COMPILE_METHOD COLCON)
```

打开rslidar\_sdk/config/config.yaml文件，并修改代码：

```
lidar_type: RSM1             #LiDAR type - RS16, RS32, RSBP, RSHELIOS, RSHELIOS_16P, RS128, RS80, RS48, RSP128, RSP80, RSP48, 
                             #             RSM1, RSM1_JUMBO, RSM2, RSE1
```

默认是RSM1，此处需要修改成RS32，当然具体型号需要视雷达而定。

除此之外，还需要将rslidar\_sdk工程目录下的_package\_ros2.xml_文件重命名为_package.xml_。

#### 2.硬件准备与配置

在物理层面我们需要将激光雷达连接到机器人的控制系统。具体操作如下：

（1）、电源连接：在配备接口盒子一同使用的时候，设备供电要求电压范围9-32 VDC，推荐使用12VDC。如果不使用接口盒子给连接雷达的端子供电，必须使用经过稳压的12VDC,V2.0及以后版本雷达将宽压功能集成在雷达内部，所以可以使用9-32VDC直接给雷达供电；

![](/assets/1.4.6_接口盒子.PNG)

（2）、电气安装：RS-LiDAR使用航插接口，雷达侧面主机到航插头的线缆长度为1米，通过航插接口连接接口盒子；

（3）、通过网线连接接口盒子与机器人控制系统。

（4）、还需配置网络，把控制系统的ip设置为与设备同一网段（雷达ip地址默认为192.168.1.200），操作示例如下：

![](/assets/1.4.6_多线激光雷达IP设置.PNG)

#### 

#### 3.启动并测试

进入工作空间目录，执行以下命令即可编译、运行。

```
colcon build
source install/setup.bash
ros2 launch rslidar_sdk start.py
```

如果没有异常，那么会自动启动rviz2，并且在rviz2中显示激光雷达扫描的点云数据。

![](/assets/1.4.6_多线激光雷达启动与测试.PNG)

