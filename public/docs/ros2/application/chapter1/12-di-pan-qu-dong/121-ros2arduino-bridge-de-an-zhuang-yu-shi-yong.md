### 1.4.1 底盘基本使用

机器人底盘琳琅满目，但是其使用上大致相同，本节将以MyCar导航机器人底盘为例演示其基本使用，MyCar导航机器人根据底盘驱动类型的不同主要分为Arduino底盘与Stm32底盘两种类型，Arduino底盘为两轮差速底盘，Stm32底盘则包括两轮差速和四轮差速两种子类型。

本节将分别介绍Arduino底盘与Stm32底盘的具体使用。

#### 1.准备工作

车辆底盘启动后，需要通过上位机进行控制，底盘与上位机的连接方式主要有两种：

* 方式1：直接通过数据线将底盘连接到电脑；
* 方式2：使用自带的上位机，并按照本教程第1.2节内容搭建远程开发环境。

无论采用哪种方式，都需要保证上位机已经按照本教程第1.3.1节内容进行了USB端口设置（如果是使用底盘自带的上位机，那么已经默认进行了配置），以确保上位机可以识别并操作外接的USB设备。

#### 2.Arduino底盘使用

##### 准备工作

在使用Arduino底盘之前，需要做如下准备工作（如果是使用底盘自带的上位机，该部分操作都已经默认实现）。

**（1）.硬件准备**

通过USB数据线将机器人底盘连接到上位机，并打开底盘开关。上位机终端下执行指令：

```
ll /dev/ttyACM*
```

如正常，将输出类似如下的结果：

```
crw-rw---- 1 root dialout 166, 0  4月 27 20:15 /dev/ttyACM0
```

注意：如果物理连接无异常，Ubuntu系统显示`无法访问 ‘/dev/ttyACM‘: 没有那个文件或目录`，那么可能是brltty驱动占用导致的，可以运行`sudo apt remove brltty`然后重新插拔一下设备即可解决问题。

**（2）.系统准备**

ros2\_arduino\_bridge是依赖于python-serial功能包的，请先在上位机安装该功能包，安装命令:

```
sudo pip install --upgrade pyserial
```

**（3）.软件安装**

调用如下指令将此软件包下载到你的ROS2工作空间下的src目录：

```
git clone https://github.com/damuxt/ros2_arduino_bridge.git
```

**（4）.环境配置**

终端下进入`ros2_arduino_bridge/scripts`,并执行指令：

```
bash create_udev_rules.sh
```

该指令将为Arduino端口绑定一个固定名称，重新将底盘与上位机连接，执行如下指令：

```
ll /dev | grep -i ttyACM
```

如正常，将输出类似如下的结果：

```
lrwxrwxrwx   1 root root           7  4月 27 20:16 myarduino -> ttyACM0
crwxrwxrwx   1 root dialout 166,   0  4月 27 20:16 ttyACM0
```

**（5）.构建功能包**

工作空间下调用如下指令，构建功能包：

```
colcon build --packages-select ros2_arduino_bridge
```

##### 使用流程

**（1）.配置参数**

在功能包下提供了机器人底盘相关参数的配置文件`ros2_arduino_bridge/params`，参数内容可以自行修改（如果是初次使用，建议使用默认），该文件内容如下：

```
/ros2_arduino_node:
  ros__parameters:
    # pid 参数
    Kd: 45
    Ki: 0
    Ko: 50
    Kp: 8
    accel_limit: 0.5 # 加速限制
    base_controller_rate: 10
    base_controller_timeout: 1.0
    base_frame: base_footprint #基坐标系
    baud: 57600 # 波特率
    encoder_resolution: 3960 
    gear_reduction: 1
    motors_reversed: false
    port: /dev/myarduino # Arduino端口
    rate: 50
    timeout: 0.5
    use_sim_time: false
    wheel_diameter: 0.065 # 轮胎直径
    wheel_track: 0.21 # 轮间距
    max_vel_x: 0.18 # 最大线速度
    min_vel_x: -0.18 # 最小线速度
    max_vel_th: 0.8 # 最大角速度
    min_vel_th: -0.8 # 最小角速度
```

**（2）.启动launch文件**

工作空间下，调用如下指令启动launch文件：

```
ros2 launch ros2_arduino_bridge ros2_arduino.launch.py
```

**（3）.控制底盘运动**

上位机上，启动键盘控制节点：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard
```

接下来，就可以通过键盘控制机器人运动了。

#### 3.Stm32底盘使用

##### 准备工作

在使用Stm32底盘之前，需要做如下准备工作（如果是使用底盘自带的上位机，该部分操作都已经默认实现）。

**（1）.硬件准备**

通过USB数据线将机器人底盘连接到上位机，并打开底盘开关。上位机终端下执行指令：

```
ll /dev/ttyUSB*
```

如正常，将输出类似如下的结果：

```
crw-rw---- 1 root dialout 166, 0  4月 27 20:15 /dev/ttyUSB0
```

PS：如果物理连接无异常，Ubuntu系统显示`无法访问 ‘/dev/ttyUSB‘: 没有那个文件或目录`，那么可能是brltty驱动占用导致的，可以运行`sudo apt remove brltty`然后重新插拔一下设备即可解决问题。

**（2）.软件安装**

调用如下指令将此软件包下载到你的ROS2工作空间下的src目录：

```
git clone https://github.com/damuxt/ros2_stm32_bridge.git
```

**（3）.环境配置**

终端下进入`ros2_stm32_bridge/scripts`,并执行指令：

```
bash create_udev_rules.sh
```

该指令将为STM32端口绑定一个固定名称，重新将底盘与上位机连接，执行如下指令：

```
ll /dev | grep -i ttyUSB
```

如正常，将输出类似如下的结果：

```
lrwxrwxrwx   1 root root           7  4月 27 20:16 mycar -> ttyUSB0
crwxrwxrwx   1 root dialout 166,   0  4月 27 20:16 ttyUSB0
```

**（4）.设置车辆类型**

修改上位机用户目录下的 .bashrc 文件，在该文件中设置车辆类型，如果你使用的是两轮差速底盘，则添加如下语句：

```
export MYCAR_MODEL=stm32_2w
```

如果你使用的是四轮差速底盘，则添加如下语句：

```
export MYCAR_MODEL=stm32_4w
```

**（5）.构建功能包**

工作空间下调用如下指令，构建功能包：

```
colcon build --packages-select ros2_stm32_bridge
```

##### 使用流程

**（1）.配置参数**

在功能包下`params`目录中提供了机器人底盘相关参数的配置文件，`stm32_2w.yaml`为两轮差速底盘的配置文件,`stm32_4w.yaml`为四轮差速底盘的配置文件，参数内容可以自行修改（如果是初次使用，建议使用默认）。

`stm32_2w.yaml`的文件内容如下：

```
/mini_driver:
  ros__parameters:
    base_frame: base_footprint
    baud_rate: 115200
    control_rate: 10
    encoder_resolution: 44.0
    kd: 30
    ki: 0
    kp: 25
    maximum_encoding: 100.0
    model_param_acw: 0.21
    model_param_cw: 0.21
    odom_frame: odom
    port_name: /dev/mycar
    qos_overrides:
      /parameter_events:
        publisher:
          depth: 1000
          durability: volatile
          history: keep_last
          reliability: reliable
      /tf:
        publisher:
          depth: 100
          durability: volatile
          history: keep_last
          reliability: reliable
    reduction_ratio: 90.0
    use_sim_time: false
    wheel_diameter: 0.065
```

`stm32_4w.yaml`的文件内容如下：

```
/mini_driver:
  ros__parameters:
    base_frame: base_footprint
    baud_rate: 115200
    control_rate: 10
    encoder_resolution: 44.0
    kd: 30
    ki: 0
    kp: 25
    maximum_encoding: 100.0
    model_param_acw: 0.45
    model_param_cw: 0.45
    odom_frame: odom
    port_name: /dev/mycar
    qos_overrides:
      /parameter_events:
        publisher:
          depth: 1000
          durability: volatile
          history: keep_last
          reliability: reliable
      /tf:
        publisher:
          depth: 100
          durability: volatile
          history: keep_last
          reliability: reliable
    reduction_ratio: 90.0
    use_sim_time: false
    wheel_diameter: 0.080
```

**（2）.启动launch文件**

工作空间下，调用如下指令启动launch文件：

```
. install/setup.bash
ros2 launch ros2_stm32_bridge driver.launch.py
```

**（3）.控制底盘运动**

上位机上，启动键盘控制节点：

```
ros2 run teleop_twist_keyboard teleop_twist_keyboard
```

接下来，就可以通过键盘控制机器人运动了。

#### 4.启动rviz2查看车辆里程计数据

不管是何种类型的底盘，在启动后都会发布一个比较重要的数据：里程计。我们可以在rviz2中查看里程计信息，启动rviz2后，相关操作如下：

* 将视图的参考坐标系（Fixed Frame）设置为odom；
* 添加TF插件；
* 添加Odometry插件，并将话题设置为odom。

使用键盘控制车辆运动时，就可以看到由Odometry插件显示的车辆的位姿信息了。![](/assets/1.3.1_02里程计查看.PNG)

#### 



