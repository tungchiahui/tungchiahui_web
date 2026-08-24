### 2.3.2 相机标定

#### 1.相机标定简介

在图像测量过程以及机器视觉应用中，为确定空间物体表面某点的三维几何位置与其在图像中对应点之间的相互关系，必须建立相机成像的几何模型，这些几何模型参数就是相机参数。在大多数条件下这些参数必须通过实验与计算才能得到（这也意味着获取的参数不能保证绝对准确），这个求解参数的过程就称之为相机标定。

相机参数主要包含三部分：

##### （1）内参

顾名思义是由相机自身特性决定，与外接环境无关，比如：焦距、像主点坐标。另外畸变参数也可以看作是内参的一部分。

##### （2）外参

外参主要是指相机坐标系相对于世界坐标系的三轴平移和旋转。

##### （3）畸变参数

由于相机的物理结构可能会导致图像生成产生畸变，比如：由于透镜质量的原因，光线在远离透镜中心的地方比靠近中心的地方更加弯曲；或者，透镜本身与相机传感器平面（像平面）或图像平面不平行也会导致图像畸变。

借助于相机标定，可以一定程度上消除图像畸变。

#### 2.相机标定准备

如果要自实现相机标定那么需要做一些软硬件方面的准备工作。

##### （1）硬件以及环境准备

**硬件准备：**

* 准备一个可以在ROS2上发布图像数据的单目相机，另外建议将相机连接在本地，不要采用远程模式，以避免由于图传延迟等因素造成不必要的干扰。

* 还需要准备类似下图的棋盘标定板，标定板可以采购，或是自行下载打印（打印后要贴在一个平整的板子上）。 本教程使用的是7行×9列的棋盘，每个单元格都是正方形，边长为2.44cm。

**环境准备：**

* 一个明亮的5m×5m区域，没有障碍物和其他棋盘图案。

##### （2）软件准备

相机标定需要依赖于其它软件包，请调用如下指令安装：

```
sudo apt install ros-${ros2-distro}-camera-calibration-parsers
sudo apt install ros-${ros2-distro}-camera-info-manager
sudo apt install ros-${ros2-distro}-launch-testing-ament-cmake
sudo apt install ros-${ros2-distro}-vision-opencv ros-${ros2-distro}-image-transport-plugins ros-${ros2-distro}-image-transport ros-${ros2-distro}-image-common
sudo apt install python3-polled-camera polled-camera-tool libpolled-camera0d
sudo apt install libtheora-dev libogg-dev libboost-python-dev
sudo apt-get install -y libssl-dev libusb-1.0-0-dev pkg-config libgtk-3-dev
sudo apt-get install -y libglfw3-dev libgl1-mesa-dev libglu1-mesa-dev
```

安装image\_pipeline功能包，这个功能包提供了一系列的图像处理工具和算法，比如：图像的传输和压缩、图像格式转换和处理、特征提取与匹配、目标检测与跟踪等等，当然，也包含我们当前需要使用的相机标定功能。总之它填补了从相机原始图像到高级视觉处理之间的空白。该功能包的安装指令如下：

```
sudo apt install ros-${ros2-distro}-image-pipeline
```

#### 3.相机标定实现

##### （1）.启动相机

要做相机标定，首先需要启动相机驱动节点，在此，我们可以复用**1.5.1 单目相机使用**中的mycar\_cam功能包，调用的指令如下：

```
ros2 launch mycar_cam usb_cam.launch.py
```

该节点会在话题`/image_raw`上发布图像数据。

##### （2）.启动标定节点

启动相机标定节点，调用的指令如下：

```
ros2 run camera_calibration cameracalibrator --size 6x8 --square 0.0244 --ros-args --remap /image:=/camera1/image_raw
```

指令解释：

* `camera_calibration`：用于相机标定的功能包；
* `cameracalibrator`：相机标定节点；
* `--size 6x8`：指定棋盘的行与列，此处的行与列参考的是棋盘的内部顶点，另外`6x8` 中的x是小写字母x；
* `--square 0.0244`：单元格的边长，是以米为单位的；
* `--ros-args --remap /image:=/image_raw`：节点订阅的话题，默认是`/image` 需要重映射为相机驱动发布的话题。

标定节点启动后，如无异常，会开启一个显示相机视频的窗口，将棋盘格至于摄像头前并适当歪斜，视频窗口中的棋盘格上将出现彩色线条。视频窗口的侧栏上，有四个彩色进度条和三个按钮（一开始为灰色），进度条代表不同维度的数据采集当某个维度的采集到了足够的数据时，对应的进度条将变为绿色，按钮对应不同的标定操作，如果标定执行正常的话，按钮会在恰当的时机由不可用变为可用（由灰色变为绿色），具体解释如下：

* X进度条：通过相机在视野中的左右移动，采集横向标定数据；

* Y进度条：通过相机在视野中的上下移动，采集纵向标定数据；

* Size进度条：通过相机在视野中的前后移动，采集尺寸数据；

* Skew进度条：通过相机的上下倾斜或左右倾斜，采集倾斜侧角数据；

* CALIBRATE按钮：当上述四个进度条都变为绿色时，意味着已经采集到了足够的数据，该按钮也变为绿色，点击之后将处理数据并进行相机标定；

* SAVE按钮：标定完毕后，该按钮变为绿色，点击之后会保存标定好的数据；

##### （3）.数据采集

接下来就可以采集标定数据了，在相机的视野范围内不断的移动棋盘格（缓慢地上下左右平移棋盘格、旋转和倾斜棋盘格并让棋盘格远离和接近摄像头），直至四个进度条变为绿色。

##### （4）.标定并保存参数

数据采集完毕后，CALIBRATE按钮也会变为绿色，点击该按钮，即可处理采集到的数据并生成标定参数，并且标定完毕后，其他按钮也会变为绿色，视频窗口中的图像也应该是无畸变的，将棋盘格重新放置在相机视野中时，窗口的右上角将显示线性误差评估，该值越小说明标定效果越理想。

点击Save按钮，即可实现标定参数的保存。

#### 4.相机标定应用

##### （1）.使用

相加标定后的使用是比较简单的，直接将标定参数复制进相机驱动的配置文件，然后修改部分内容即可，具体到当前案例，可以将ost.yaml中的内容直接复制到mycar\_cam/params/camera\_info.yaml中，然后修改image\_width、image\_height、camera\_name的参数值以保证与mycar\_cam/params/params.yaml中参数内容一致。

重新构建后，再调用如下指令启动相机驱动：

```
ros2 launch mycar_cam usb_cam.launch.py
```

但是仔细观察会发现，订阅到的图像数据好像并没有改变，事实也的确如此，当前相机驱动节点仍然发布的是原始数据，并不能测试标定后的效果，如果要显示标定后的图像，那么必须结合其他功能包完成。

##### （2）.测试

要显示标定后的数据，我们可以使用`image_proc`功能包，`image_proc`可以从单幅原始图像流中进行图像校正和颜色处理，以去除相机的失真。该功能包的安装指令如下：

```
sudo apt install ros-${ros2-distro}-image-proc
```

安装完毕后，可以直接调用功能包内置的launch文件，指令如下：

```
ros2 launch image_proc image_proc.launch.py namespace:=/camera1
```

然后打开rviz2或rqt添加图像显示插件，将话题设置为`/camera1/image_rect_color`即可显示标定后的图像了，畸变程度明显要小于原始图像。

