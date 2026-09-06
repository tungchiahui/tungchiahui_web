### 4.6.2 多车仿真环境搭建

多车环境可以基于stage\_ros2实现，在stage\_ros2中已经内置了一个多车环境，其对应的仿真配置文件为功能包world目录下的`my_house_multi.world`，而对应的启动文件则为launch目录下的`my_house_multi.launch.py`。

#### 1.添加机器人

默认的多车环境下包含两辆机器人，而本案例中采用了三辆机器人，因此还需要修改`my_house_multi.world`文件再添加一台机器人，请在在该文件中追加如下内容：

```
car_base_with_laser_camera(
  name "robot_2"
  color "blue"
  pose [ -6 -6 0 0 ] 
)
```

在上述设置中，新生成的机器人名字为`robot_2`，颜色为蓝色，生成坐标为（-6，-6，0）且航向角为0。

#### 2.编译

终端中进入当前工作空间，编译功能包：

```
colcon build --packages-select stage_ros2
```

#### 3.执行

终端中进入当前工作空间，输入如下指令：

```
. install/setup.bash
ros2 launch stage_ros2 my_house_multi.launch.py
```

指令执行完毕，仿真环境将启动，并生成三辆机器人。

![](/assets/4.6.1_多车.PNG)

#### 4.可视化

启动完毕，可以在rviz2中可视化显示某台机器人相关数据。

##### （1）设置参考坐标系

在stage\_ros2中，多机器人的坐标系为了进行区分，坐标系名称一般会以机器人名称作为前缀，比如三台机器人名称为别为`robot_0`、`robot_1`和`robot_2`且三者都有雷达坐标系，那么对应的各自雷达坐标系名称可能为：`robot_0/laser`、`robot_1/laser`和`robot_2/laser`。

当前有三台机器人，那么也有三套坐标系，在设置参考坐标系时，查看哪台机器人的数据就要以哪台机器人为参考基准，比如要查看第一台机器人的数据，那么可以将参考坐标系设置为：`robot_0/odom`。

##### （2）添加插件

与坐标系类似的，多机器人的传感器数据为了区分，各传感器的话题名称一般会议机器人的名称作为命名空间，比如三台机器人各自雷达消息对应的话题可能分别为：`robot_0/base_scan`、`robot_1/base_scan`和`robot_2/base_scan`。其他图像、里程计等话题与之类似。rviz2设置完毕后，运行结果如下。

![](/assets/4.6.1_多车可视化.PNG)

